import Stripe from "stripe";
import { Client, Environment, OrdersController, CheckoutPaymentIntent } from "@paypal/paypal-server-sdk";
import { z } from "zod";
import { asc } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import { invokeLLM } from "./_core/llm";
import { adminRouter } from "./admin";
import { getDb } from "./db";
import { products, blogPosts, digitalProducts, digitalPurchases, aiVideos, affiliateProducts, membershipTiers } from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import crypto from "crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-04-22.dahlia",
});

// PayPal client
const paypalClient = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: process.env.PAYPAL_CLIENT_ID || "",
    oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
  },
  environment: process.env.PAYPAL_ENV === "live" ? Environment.Production : Environment.Sandbox,
});
const paypalOrders = new OrdersController(paypalClient);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  shop: router({
    createCheckoutSession: publicProcedure
      .input(
        z.object({
          items: z.array(
            z.object({
              name: z.string(),
              priceUSD: z.number(),
              quantity: z.number(),
              image: z.string().optional(),
            })
          ),
          currency: z.string().default("usd"),
          customerEmail: z.string().email().optional(),
          paymentMethod: z.enum(["card", "apple_pay", "google_pay"]).default("card"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const origin = ctx.req.headers.origin || "http://localhost:3000";

        const lineItems = input.items.map((item) => ({
          price_data: {
            currency: input.currency,
            product_data: {
              name: item.name,
              images: item.image ? [item.image] : [],
            },
            unit_amount: Math.round(item.priceUSD * 100),
          },
          quantity: item.quantity,
        }));

        const session = await stripe.checkout.sessions.create({
          line_items: lineItems,
          mode: "payment",
          customer_email: input.customerEmail || undefined,
          allow_promotion_codes: true,
          shipping_address_collection: {
            allowed_countries: ["US", "GB", "CA", "AU", "DE", "FR", "JP", "NG", "ZA", "AE"],
          },
          shipping_options: [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: 0, currency: input.currency },
                display_name: "Standard Shipping",
                delivery_estimate: {
                  minimum: { unit: "business_day", value: 5 },
                  maximum: { unit: "business_day", value: 10 },
                },
              },
            },
            {
              shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: 1999, currency: input.currency },
                display_name: "Express Shipping",
                delivery_estimate: {
                  minimum: { unit: "business_day", value: 2 },
                  maximum: { unit: "business_day", value: 3 },
                },
              },
            },
          ],
          success_url: `${origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/checkout`,
          metadata: {
            source: "build_level_website",
          },
        });

        // Notify owner of new order
        const itemSummary = input.items
          .map((i) => `${i.quantity}x ${i.name}`)
          .join(", ");
        const total = input.items
          .reduce((sum, i) => sum + i.priceUSD * i.quantity, 0)
          .toFixed(2);
        await notifyOwner({
          title: "🛒 New Order Placed — BUILD LEVEL",
          content: `A new order was placed on your store.\n\nItems: ${itemSummary}\nTotal: $${total} ${input.currency.toUpperCase()}\nCustomer: ${input.customerEmail || "Guest"}`,
        }).catch(() => {/* non-blocking */});

        return { url: session.url, sessionId: session.id };
      }),

    // PayPal: create order
    createPayPalOrder: publicProcedure
      .input(
        z.object({
          items: z.array(
            z.object({
              name: z.string(),
              priceUSD: z.number(),
              quantity: z.number(),
            })
          ),
          currency: z.string().default("USD"),
          shippingUSD: z.number().default(0),
        })
      )
      .mutation(async ({ input }) => {
        const itemsTotal = input.items
          .reduce((sum, i) => sum + i.priceUSD * i.quantity, 0);
        const totalAmount = (itemsTotal + input.shippingUSD).toFixed(2);

        const order = await paypalOrders.createOrder({
          body: {
            intent: CheckoutPaymentIntent.Capture,
            purchaseUnits: [
              {
                amount: {
                  currencyCode: input.currency.toUpperCase(),
                  value: totalAmount,
                  breakdown: {
                    itemTotal: {
                      currencyCode: input.currency.toUpperCase(),
                      value: totalAmount,
                    },
                  },
                },
                items: input.items.map((i) => ({
                  name: i.name,
                  quantity: String(i.quantity),
                  unitAmount: {
                    currencyCode: input.currency.toUpperCase(),
                    value: i.priceUSD.toFixed(2),
                  },
                })),
              },
            ],
          },
        });

        return { orderId: order.result.id };
      }),

    // PayPal: capture order after approval
    capturePayPalOrder: publicProcedure
      .input(z.object({ orderId: z.string() }))
      .mutation(async ({ input }) => {
        const capture = await paypalOrders.captureOrder({
          id: input.orderId,
        });

        const status = capture.result.status;
        if (status === "COMPLETED") {
          await notifyOwner({
            title: "💰 PayPal Payment Received — BUILD LEVEL",
            content: `PayPal order ${input.orderId} was completed successfully.`,
          }).catch(() => {});
        }

        return { status, orderId: input.orderId };
      }),
  }),

  chat: router({
    message: publicProcedure
      .input(z.object({
        messages: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        const systemPrompt = `You are the BUILD LEVEL customer service assistant. BUILD LEVEL is a premium motivational streetwear brand built on the principles of Discipline, Focus, and Execution.

You help customers with:
- Shipping: Standard shipping takes 5-10 business days worldwide. Express shipping (2-3 business days) is available for $19.99. Free standard shipping on orders over $100.
- Returns: 30-day return policy. Items must be unworn, unwashed, and in original condition with tags attached. Contact info@buildlevel.com to initiate a return.
- Sizing: We recommend sizing up if you're between sizes. Hoodies run true to size. T-shirts have a slim fit. Size chart is available on each product page.
- Products: We sell hoodies, t-shirts, hats, and accessories. All products feature motivational BUILD LEVEL branding.
- Payment: We accept all major credit/debit cards, Apple Pay, Google Pay, PayPal, Klarna, and Afterpay.
- Order tracking: After your order ships, you'll receive a tracking email from our fulfillment partner.
- Contact: Email info@buildlevel.com or use the contact form on the website.

Keep responses concise, helpful, and on-brand. Use the BUILD LEVEL tone: direct, motivational, and professional. Never make up information. If you don't know something, direct them to email info@buildlevel.com.`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            ...input.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        });

        const rawContent = response.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : "I'm here to help! Please email info@buildlevel.com for further assistance.";
        return { reply: content };
      }),
  }),

  // Public product listing (used by Shop and Home pages)
  products: router({
    list: publicProcedure
      .input(z.object({
        category: z.string().optional(),
        featuredOnly: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const rows = await db
          .select()
          .from(products)
          .orderBy(asc(products.sortOrder), asc(products.createdAt));
        return rows
          .filter((p) => p.inStock !== false)
          .filter((p) => !input.category || p.category === input.category)
          .filter((p) => !input.featuredOnly || p.featured === true)
          .map((p) => ({
            ...p,
            price: parseFloat(String(p.price)),
            compareAtPrice: p.compareAtPrice ? parseFloat(String(p.compareAtPrice)) : null,
          }));
      }),
  }),

  // Blog procedures
  blog: router({
    list: publicProcedure
      .input(z.object({ category: z.string().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const rows = await db
          .select()
          .from(blogPosts)
          .where(eq(blogPosts.published, true))
          .orderBy(desc(blogPosts.createdAt));
        return input.category ? rows.filter(p => p.category === input.category) : rows;
      }),
    get: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(blogPosts).where(and(eq(blogPosts.slug, input.slug), eq(blogPosts.published, true)));
        return rows[0] || null;
      }),
    // Admin: list all (including unpublished)
    adminList: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
    }),
    adminCreate: publicProcedure
      .input(z.object({
        title: z.string().min(1),
        slug: z.string().min(1),
        excerpt: z.string().optional(),
        content: z.string().min(1),
        imageUrl: z.string().optional(),
        category: z.string().default("mindset"),
        published: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.insert(blogPosts).values(input);
        return { success: true };
      }),
    adminUpdate: publicProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        excerpt: z.string().optional(),
        content: z.string().optional(),
        imageUrl: z.string().optional(),
        category: z.string().optional(),
        published: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const { id, ...data } = input;
        await db.update(blogPosts).set(data).where(eq(blogPosts.id, id));
        return { success: true };
      }),
    adminDelete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.delete(blogPosts).where(eq(blogPosts.id, input.id));
        return { success: true };
      }),
  }),

  // Digital products procedures
  digital: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(digitalProducts)
        .where(eq(digitalProducts.published, true))
        .orderBy(desc(digitalProducts.sortOrder));
      return rows.map(p => ({ ...p, price: parseFloat(String(p.price)) }));
    }),
    adminList: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(digitalProducts).orderBy(desc(digitalProducts.createdAt));
      return rows.map(p => ({ ...p, price: parseFloat(String(p.price)) }));
    }),
    adminCreate: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        price: z.number().min(0),
        category: z.string().default("guide"),
        imageUrl: z.string().optional(),
        fileKey: z.string().optional(),
        fileUrl: z.string().optional(),
        fileName: z.string().optional(),
        badge: z.string().optional(),
        published: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.insert(digitalProducts).values({ ...input, price: String(input.price) });
        return { success: true };
      }),
    adminUpdate: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        price: z.number().optional(),
        category: z.string().optional(),
        imageUrl: z.string().optional(),
        fileKey: z.string().optional(),
        fileUrl: z.string().optional(),
        fileName: z.string().optional(),
        badge: z.string().optional(),
        published: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const { id, price, ...rest } = input;
        const data: Record<string, unknown> = { ...rest };
        if (price !== undefined) data.price = String(price);
        await db.update(digitalProducts).set(data).where(eq(digitalProducts.id, id));
        return { success: true };
      }),
    adminDelete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.delete(digitalProducts).where(eq(digitalProducts.id, input.id));
        return { success: true };
      }),
    // Create checkout session for digital product
    createCheckout: publicProcedure
      .input(z.object({
        productId: z.number(),
        customerEmail: z.string().email(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const rows = await db.select().from(digitalProducts).where(eq(digitalProducts.id, input.productId));
        const product = rows[0];
        if (!product || !product.published) throw new Error("Product not found");
        const origin = ctx.req.headers.origin || "http://localhost:3000";
        const downloadToken = crypto.randomBytes(32).toString("hex");
        // Store pending purchase
        await db.insert(digitalPurchases).values({
          productId: input.productId,
          email: input.customerEmail,
          downloadToken,
        });
        const session = await stripe.checkout.sessions.create({
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: { name: product.name, description: product.description || undefined },
              unit_amount: Math.round(parseFloat(String(product.price)) * 100),
            },
            quantity: 1,
          }],
          mode: "payment",
          customer_email: input.customerEmail,
          allow_promotion_codes: true,
          success_url: `${origin}/digital/download?token=${downloadToken}`,
          cancel_url: `${origin}/digital`,
          metadata: { downloadToken, productId: String(input.productId) },
        });
        return { url: session.url };
      }),
    // Verify download token and return file URL
    getDownload: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const purchases = await db.select().from(digitalPurchases).where(eq(digitalPurchases.downloadToken, input.token));
        const purchase = purchases[0];
        if (!purchase) return null;
        const products2 = await db.select().from(digitalProducts).where(eq(digitalProducts.id, purchase.productId));
        const product = products2[0];
        if (!product) return null;
        // Mark as downloaded
        if (!purchase.downloadedAt) {
          await db.update(digitalPurchases).set({ downloadedAt: new Date() }).where(eq(digitalPurchases.downloadToken, input.token));
        }
        return { productName: product.name, fileUrl: product.fileUrl, fileName: product.fileName };
      }),
  }),

  admin: adminRouter,

  notifications: router({
    // Owner alert when someone signs up to the email list
    emailSignup: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        await notifyOwner({
          title: "📧 New Email Signup — BUILD LEVEL",
          content: `A new subscriber joined your email list.\n\nEmail: ${input.email}\nTime: ${new Date().toUTCString()}`,
        }).catch(() => {/* non-blocking */});
        return { success: true };
      }),

    // Owner alert when contact form is submitted
    contactForm: publicProcedure
      .input(z.object({
        name: z.string(),
        email: z.string().email(),
        message: z.string(),
      }))
      .mutation(async ({ input }) => {
        await notifyOwner({
          title: `📬 New Contact Form — ${input.name}`,
          content: `Name: ${input.name}\nEmail: ${input.email}\n\nMessage:\n${input.message}`,
        }).catch(() => {/* non-blocking */});
        return { success: true };
      }),
  }),

  aiVideos: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(aiVideos).where(eq(aiVideos.published, true)).orderBy(asc(aiVideos.sortOrder), desc(aiVideos.createdAt));
    }),
    adminList: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(aiVideos).orderBy(asc(aiVideos.sortOrder), desc(aiVideos.createdAt));
    }),
    adminCreate: publicProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        videoUrl: z.string().optional(),
        thumbnailUrl: z.string().optional(),
        category: z.string().default("motivation"),
        duration: z.string().optional(),
        badge: z.string().optional(),
        published: z.boolean().default(false),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.insert(aiVideos).values(input);
        return { success: true };
      }),
    adminUpdate: publicProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        videoUrl: z.string().optional(),
        thumbnailUrl: z.string().optional(),
        category: z.string(),
        duration: z.string().optional(),
        badge: z.string().optional(),
        published: z.boolean(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const { id, ...data } = input;
        await db.update(aiVideos).set(data).where(eq(aiVideos.id, id));
        return { success: true };
      }),
    adminDelete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.delete(aiVideos).where(eq(aiVideos.id, input.id));
        return { success: true };
      }),
  }),

  affiliate: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(affiliateProducts).where(eq(affiliateProducts.published, true)).orderBy(asc(affiliateProducts.sortOrder), desc(affiliateProducts.createdAt));
    }),
    adminList: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(affiliateProducts).orderBy(asc(affiliateProducts.sortOrder), desc(affiliateProducts.createdAt));
    }),
    adminCreate: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        price: z.number().optional(),
        affiliateUrl: z.string().url(),
        imageUrl: z.string().optional(),
        category: z.string().default("gear"),
        brand: z.string().optional(),
        badge: z.string().optional(),
        commission: z.string().optional(),
        published: z.boolean().default(false),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.insert(affiliateProducts).values({ ...input, price: input.price?.toString() });
        return { success: true };
      }),
    adminUpdate: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        price: z.number().optional(),
        affiliateUrl: z.string().url(),
        imageUrl: z.string().optional(),
        category: z.string(),
        brand: z.string().optional(),
        badge: z.string().optional(),
        commission: z.string().optional(),
        published: z.boolean(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const { id, price, ...data } = input;
        await db.update(affiliateProducts).set({ ...data, price: price?.toString() }).where(eq(affiliateProducts.id, id));
        return { success: true };
      }),
    adminDelete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.delete(affiliateProducts).where(eq(affiliateProducts.id, input.id));
        return { success: true };
      }),
  }),

  membership: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(membershipTiers).where(eq(membershipTiers.published, true)).orderBy(asc(membershipTiers.sortOrder));
    }),
    adminList: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(membershipTiers).orderBy(asc(membershipTiers.sortOrder));
    }),
    adminCreate: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        price: z.number().min(0),
        interval: z.enum(["monthly", "yearly"]).default("monthly"),
        features: z.array(z.string()).default([]),
        badge: z.string().optional(),
        stripePriceId: z.string().optional(),
        published: z.boolean().default(false),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.insert(membershipTiers).values({ ...input, price: input.price.toString() });
        return { success: true };
      }),
    adminUpdate: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        price: z.number().min(0),
        interval: z.enum(["monthly", "yearly"]),
        features: z.array(z.string()),
        badge: z.string().optional(),
        stripePriceId: z.string().optional(),
        published: z.boolean(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        const { id, price, ...data } = input;
        await db.update(membershipTiers).set({ ...data, price: price.toString() }).where(eq(membershipTiers.id, id));
        return { success: true };
      }),
    adminDelete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.delete(membershipTiers).where(eq(membershipTiers.id, input.id));
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;

