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
import { products } from "../drizzle/schema";

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
        })
      )
      .mutation(async ({ input }) => {
        const totalAmount = input.items
          .reduce((sum, i) => sum + i.priceUSD * i.quantity, 0)
          .toFixed(2);

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
});

export type AppRouter = typeof appRouter;

