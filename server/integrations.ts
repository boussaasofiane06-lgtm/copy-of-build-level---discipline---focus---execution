/* ==========================================================================
   BUILD LEVEL — Integrations Router
   Printify, Shopify, and AI Customer Service — all admin-protected
   ========================================================================== */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, desc, asc } from "drizzle-orm";
import { siteSettings, products, chatMessages } from "../drizzle/schema";
import { getDb } from "./db";
import { publicProcedure, router } from "./_core/trpc";
import { verifyAdminPassword, verifyAdminToken as verifyAdminJwt, ADMIN_COOKIE } from "./_core/adminAuth";
import { invokeLLM } from "./_core/llm";

// ─── Admin middleware (same as admin.ts) ──────────────────────────────────────

function parseCookieHeader(header: string | undefined): Map<string, string> {
  if (!header) return new Map();
  const map = new Map<string, string>();
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) map.set(k.trim(), decodeURIComponent(v.join("=")));
  }
  return map;
}

function verifyRawPassword(token: string): boolean {
  return verifyAdminPassword(token, process.env.ADMIN_PASSWORD_HASH || "");
}

const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const req = (ctx as any).req;
  const cookies = parseCookieHeader(req?.headers?.cookie);
  const cookieToken = cookies.get(ADMIN_COOKIE);
  if (cookieToken && await verifyAdminJwt(cookieToken)) return next({ ctx });
  const authHeader = req?.headers?.authorization as string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    const bearerToken = authHeader.substring(7);
    if (await verifyAdminJwt(bearerToken)) return next({ ctx });
  }
  const headerToken = req?.headers?.["x-admin-token"] as string | undefined;
  if (headerToken && verifyRawPassword(headerToken)) return next({ ctx });
  throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin access required" });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(siteSettings).set({ value, updatedAt: new Date() }).where(eq(siteSettings.key, key));
  } else {
    await db.insert(siteSettings).values({ key, value, updatedAt: new Date() });
  }
}

// ─── Printify API helpers ─────────────────────────────────────────────────────

async function printifyRequest(path: string, method = "GET", body?: unknown) {
  const apiKey = await getSetting("printify_api_key");
  if (!apiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Printify API key not configured. Go to Integrations tab to add it." });

  const res = await fetch(`https://api.printify.com/v1${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new TRPCError({ code: "BAD_REQUEST", message: `Printify API error: ${res.status} ${text.slice(0, 200)}` });
  }
  return res.json();
}

// ─── Shopify API helpers ──────────────────────────────────────────────────────

async function shopifyRequest(path: string, method = "GET", body?: unknown) {
  const storeUrl = await getSetting("shopify_store_url");
  const apiKey = await getSetting("shopify_api_key");
  if (!storeUrl || !apiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Shopify credentials not configured. Go to Integrations tab to add them." });

  const cleanStore = storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const res = await fetch(`https://${cleanStore}/admin/api/2024-01${path}`, {
    method,
    headers: {
      "X-Shopify-Access-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new TRPCError({ code: "BAD_REQUEST", message: `Shopify API error: ${res.status} ${text.slice(0, 200)}` });
  }
  return res.json();
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const integrationsRouter = router({

  // ─── Printify ──────────────────────────────────────────────────────────────

  /** Save Printify credentials */
  savePrintifyCredentials: adminProcedure
    .input(z.object({ apiKey: z.string().min(1), shopId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await setSetting("printify_api_key", input.apiKey);
      await setSetting("printify_shop_id", input.shopId);
      return { success: true };
    }),

  /** Get Printify connection status */
  getPrintifyStatus: adminProcedure.query(async () => {
    const apiKey = await getSetting("printify_api_key");
    const shopId = await getSetting("printify_shop_id");
    return { connected: !!(apiKey && shopId), hasApiKey: !!apiKey, hasShopId: !!shopId };
  }),

  /** List products from Printify */
  listPrintifyProducts: adminProcedure
    .input(z.object({ page: z.number().default(1) }))
    .query(async ({ input }) => {
      const shopId = await getSetting("printify_shop_id");
      if (!shopId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Printify Shop ID not configured" });
      const data = await printifyRequest(`/shops/${shopId}/products.json?page=${input.page}&limit=20`);
      return {
        products: (data.data || []).map((p: any) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          images: p.images?.slice(0, 3).map((img: any) => img.src) || [],
          variants: p.variants?.map((v: any) => ({
            id: v.id,
            title: v.title,
            price: v.price / 100,
            sku: v.sku,
          })) || [],
          published: p.visible,
          tags: p.tags || [],
        })),
        total: data.total || 0,
        currentPage: data.current_page || 1,
        lastPage: data.last_page || 1,
      };
    }),

  /** Import a Printify product into the local store */
  importPrintifyProduct: adminProcedure
    .input(z.object({ printifyProductId: z.string() }))
    .mutation(async ({ input }) => {
      const shopId = await getSetting("printify_shop_id");
      if (!shopId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Printify Shop ID not configured" });

      const p = await printifyRequest(`/shops/${shopId}/products/${input.printifyProductId}.json`);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Check if already imported
      const existing = await db.select().from(products)
        .where(eq(products.printifyProductId, input.printifyProductId)).limit(1);
      if (existing.length > 0) {
        return { success: true, id: existing[0].id, alreadyExists: true };
      }

      const firstVariant = p.variants?.[0];
      const price = firstVariant ? (firstVariant.price / 100).toFixed(2) : "29.99";
      const imageUrl = p.images?.[0]?.src || null;

      const [result] = await db.insert(products).values({
        name: p.title,
        description: p.description || null,
        price,
        category: "apparel",
        sizes: p.variants?.map((v: any) => v.title).filter(Boolean).slice(0, 10) || ["S", "M", "L", "XL"],
        imageUrl,
        printifyProductId: p.id,
        inStock: true,
        published: false,
        hidden: false,
        delisted: false,
        featured: false,
        sortOrder: 0,
      });

      return { success: true, alreadyExists: false };
    }),

  /** List Printify orders */
  listPrintifyOrders: adminProcedure
    .input(z.object({ page: z.number().default(1) }))
    .query(async ({ input }) => {
      const shopId = await getSetting("printify_shop_id");
      if (!shopId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Printify Shop ID not configured" });
      const data = await printifyRequest(`/shops/${shopId}/orders.json?page=${input.page}&limit=20`);
      return {
        orders: (data.data || []).map((o: any) => ({
          id: o.id,
          status: o.status,
          createdAt: o.created_at,
          totalPrice: o.total_price / 100,
          lineItems: o.line_items?.map((li: any) => ({
            productId: li.product_id,
            variantId: li.variant_id,
            quantity: li.quantity,
            title: li.metadata?.title || "Product",
          })) || [],
          addressTo: {
            name: `${o.address_to?.first_name || ""} ${o.address_to?.last_name || ""}`.trim(),
            country: o.address_to?.country || "",
          },
        })),
        total: data.total || 0,
      };
    }),

  // ─── Shopify ───────────────────────────────────────────────────────────────

  /** Save Shopify credentials */
  saveShopifyCredentials: adminProcedure
    .input(z.object({ storeUrl: z.string().min(1), apiKey: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await setSetting("shopify_store_url", input.storeUrl);
      await setSetting("shopify_api_key", input.apiKey);
      return { success: true };
    }),

  /** Get Shopify connection status */
  getShopifyStatus: adminProcedure.query(async () => {
    const storeUrl = await getSetting("shopify_store_url");
    const apiKey = await getSetting("shopify_api_key");
    return { connected: !!(storeUrl && apiKey), storeUrl: storeUrl || "" };
  }),

  /** List products from Shopify */
  listShopifyProducts: adminProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const data = await shopifyRequest(`/products.json?limit=${input.limit}&status=active`);
      return (data.products || []).map((p: any) => ({
        id: String(p.id),
        title: p.title,
        description: p.body_html?.replace(/<[^>]*>/g, "").slice(0, 200) || "",
        images: p.images?.slice(0, 3).map((img: any) => img.src) || [],
        variants: p.variants?.map((v: any) => ({
          id: String(v.id),
          title: v.title,
          price: parseFloat(v.price),
          sku: v.sku,
          inventory: v.inventory_quantity,
        })) || [],
        status: p.status,
        tags: p.tags ? p.tags.split(", ") : [],
        vendor: p.vendor,
      }));
    }),

  /** Import a Shopify product into the local store */
  importShopifyProduct: adminProcedure
    .input(z.object({ shopifyProductId: z.string() }))
    .mutation(async ({ input }) => {
      const data = await shopifyRequest(`/products/${input.shopifyProductId}.json`);
      const p = data.product;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const existing = await db.select().from(products)
        .where(eq(products.shopifyProductId, input.shopifyProductId)).limit(1);
      if (existing.length > 0) {
        return { success: true, id: existing[0].id, alreadyExists: true };
      }

      const firstVariant = p.variants?.[0];
      const price = firstVariant ? parseFloat(firstVariant.price).toFixed(2) : "29.99";
      const imageUrl = p.images?.[0]?.src || null;
      const sizes = p.variants?.map((v: any) => v.title).filter((t: string) => t !== "Default Title").slice(0, 10) || ["S", "M", "L", "XL"];

      await db.insert(products).values({
        name: p.title,
        description: p.body_html?.replace(/<[^>]*>/g, "").slice(0, 1000) || null,
        price,
        category: "apparel",
        sizes,
        imageUrl,
        shopifyProductId: input.shopifyProductId,
        shopifyVariantId: firstVariant ? String(firstVariant.id) : null,
        inStock: true,
        published: false,
        hidden: false,
        delisted: false,
        featured: false,
        sortOrder: 0,
      });

      return { success: true, alreadyExists: false };
    }),

  /** List Shopify orders */
  listShopifyOrders: adminProcedure
    .input(z.object({ limit: z.number().default(20), status: z.string().default("any") }))
    .query(async ({ input }) => {
      const data = await shopifyRequest(`/orders.json?limit=${input.limit}&status=${input.status}`);
      return (data.orders || []).map((o: any) => ({
        id: String(o.id),
        name: o.name,
        email: o.email,
        createdAt: o.created_at,
        totalPrice: parseFloat(o.total_price),
        currency: o.currency,
        financialStatus: o.financial_status,
        fulfillmentStatus: o.fulfillment_status || "unfulfilled",
        lineItems: o.line_items?.map((li: any) => ({
          title: li.title,
          quantity: li.quantity,
          price: parseFloat(li.price),
          sku: li.sku,
        })) || [],
        customer: {
          name: `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim(),
          email: o.customer?.email || o.email || "",
        },
      }));
    }),

  // ─── AI Customer Service ───────────────────────────────────────────────────

  /** Get AI chat config */
  getAIChatConfig: adminProcedure.query(async () => {
    const enabled = await getSetting("ai_chat_enabled");
    const persona = await getSetting("ai_chat_persona");
    const greeting = await getSetting("ai_chat_greeting");
    return {
      enabled: enabled !== "false",
      persona: persona || `You are the BUILD LEVEL customer service assistant. BUILD LEVEL is a premium motivational streetwear brand built on the principles of Discipline, Focus, and Execution.

Help customers with:
- Shipping: Standard 5-10 business days worldwide. Express (2-3 days) for $19.99. Free standard shipping on orders over $100.
- Returns: 30-day return policy. Items must be unworn with tags. Email info@buildlevel.com to start a return.
- Sizing: Size up if between sizes. Hoodies run true to size. T-shirts are slim fit.
- Products: Hoodies, t-shirts, hats, and accessories with motivational BUILD LEVEL branding.
- Payment: Cards, Apple Pay, Google Pay, PayPal, Klarna, Afterpay.
- Contact: info@buildlevel.com

Keep responses concise, direct, and on-brand. Never make up information.`,
      greeting: greeting || "Hey! How can I help you today? 💪",
    };
  }),

  /** Update AI chat config */
  updateAIChatConfig: adminProcedure
    .input(z.object({
      enabled: z.boolean().optional(),
      persona: z.string().optional(),
      greeting: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.enabled !== undefined) await setSetting("ai_chat_enabled", String(input.enabled));
      if (input.persona !== undefined) await setSetting("ai_chat_persona", input.persona);
      if (input.greeting !== undefined) await setSetting("ai_chat_greeting", input.greeting);
      return { success: true };
    }),

  /** Get recent chat sessions (admin view) */
  listChatSessions: adminProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(chatMessages)
        .orderBy(desc(chatMessages.createdAt))
        .limit(input.limit);

      // Group by sessionId
      const sessions = new Map<string, typeof rows>();
      for (const row of rows) {
        if (!sessions.has(row.sessionId)) sessions.set(row.sessionId, []);
        sessions.get(row.sessionId)!.push(row);
      }

      return Array.from(sessions.entries()).map(([sessionId, messages]) => ({
        sessionId,
        messageCount: messages.length,
        lastMessage: messages[0]?.content?.slice(0, 100) || "",
        lastActivity: messages[0]?.createdAt,
        preview: messages.slice(0, 3),
      }));
    }),

  /** Get messages for a specific chat session */
  getChatSession: adminProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(chatMessages)
        .where(eq(chatMessages.sessionId, input.sessionId))
        .orderBy(asc(chatMessages.createdAt));
    }),
});

// ─── Public AI Chat endpoint (used by the chat widget on the site) ────────────

export const publicChatRouter = router({
  /** Send a message to the AI customer service */
  sendMessage: publicProcedure
    .input(z.object({
      sessionId: z.string().min(1).max(128),
      message: z.string().min(1).max(2000),
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })).default([]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Check if chat is enabled
      const enabled = await getSetting("ai_chat_enabled");
      if (enabled === "false") {
        return { reply: "Chat is currently unavailable. Please email info@buildlevel.com for support." };
      }

      const persona = await getSetting("ai_chat_persona") || "You are a helpful customer service assistant for BUILD LEVEL, a motivational streetwear brand.";

      // Save user message to DB
      if (db) {
        await db.insert(chatMessages).values({
          sessionId: input.sessionId,
          role: "user",
          content: input.message,
        });
      }

      // Build message history for context
      const messages = [
        { role: "system" as const, content: persona },
        ...input.history.slice(-6).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: input.message },
      ];

      let reply: string;
      try {
        const response = await invokeLLM({ messages });
        const rawContent = response.choices?.[0]?.message?.content;
        reply = typeof rawContent === "string" ? rawContent : (Array.isArray(rawContent) ? rawContent.map((c: any) => c.text || "").join("") : "Thanks for reaching out! Email info@buildlevel.com for help.");
      } catch {
        reply = "Thanks for reaching out! For the fastest help, email us at info@buildlevel.com.";
      }

      // Save assistant reply to DB
      if (db) {
        await db.insert(chatMessages).values({
          sessionId: input.sessionId,
          role: "assistant",
          content: reply,
        });
      }

      return { reply };
    }),

  /** Get chat widget config (public — just enabled status and greeting) */
  getWidgetConfig: publicProcedure.query(async () => {
    const enabled = await getSetting("ai_chat_enabled");
    const greeting = await getSetting("ai_chat_greeting");
    return {
      enabled: enabled !== "false",
      greeting: greeting || "Hey! How can I help you today? 💪",
    };
  }),
});
