import { Router, Request, Response } from "express";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import {
  products, blogPosts, digitalProducts, affiliateProducts,
  membershipTiers, siteSettings, aiVideos
} from "../db/schema.js";
import { requireAdmin, verifyAdminPassword, signAdminToken, ADMIN_COOKIE } from "../middleware/adminAuth.js";

const router = Router();

// ─── Login ────────────────────────────────────────────────────────────────────
router.post("/login", (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password || !verifyAdminPassword(password)) {
    res.status(401).json({ success: false, error: "Invalid password" });
    return;
  }
  const token = signAdminToken();
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ success: true, token });
});

router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie(ADMIN_COOKIE);
  res.json({ success: true });
});

router.get("/me", requireAdmin, (req: Request, res: Response) => {
  res.json({ admin: true });
});

// ─── Products ─────────────────────────────────────────────────────────────────
router.get("/products", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(products).orderBy(asc(products.sortOrder), asc(products.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  compareAtPrice: z.number().optional().nullable(),
  category: z.string().default("apparel"),
  sizes: z.array(z.string()).default([]),
  imageUrl: z.string().optional().nullable(),
  badge: z.string().optional().nullable(),
  inStock: z.boolean().default(true),
  published: z.boolean().default(false),
  hidden: z.boolean().default(false),
  delisted: z.boolean().default(false),
  featured: z.boolean().default(false),
  sortOrder: z.number().default(0),
  shopifyVariantId: z.string().optional().nullable(),
  shopifyProductId: z.string().optional().nullable(),
  printifyProductId: z.string().optional().nullable(),
});

router.post("/products", requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = productSchema.parse(req.body);
    const db = await getDb();
    await db.insert(products).values({
      name: data.name,
      description: data.description,
      price: String(data.price),
      compareAtPrice: data.compareAtPrice ? String(data.compareAtPrice) : null,
      category: data.category,
      sizes: data.sizes,
      imageUrl: data.imageUrl,
      badge: data.badge,
      inStock: data.inStock,
      published: data.published,
      hidden: data.hidden,
      delisted: data.delisted,
      featured: data.featured,
      sortOrder: data.sortOrder,
      shopifyVariantId: data.shopifyVariantId,
      shopifyProductId: data.shopifyProductId,
      printifyProductId: data.printifyProductId,
    });
    const [inserted] = await db.select({ id: products.id }).from(products).orderBy(asc(products.createdAt)).limit(1);
    res.json({ success: true, id: inserted?.id ?? 0 });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/products/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const data = productSchema.partial().parse(req.body);
    const db = await getDb();
    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.price !== undefined) updateData.price = String(data.price);
    if (data.compareAtPrice !== undefined) updateData.compareAtPrice = data.compareAtPrice ? String(data.compareAtPrice) : null;
    await db.update(products).set(updateData).where(eq(products.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/products/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const db = await getDb();
    await db.delete(products).where(eq(products.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Blog Posts ───────────────────────────────────────────────────────────────
router.get("/blog", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(blogPosts).orderBy(asc(blogPosts.sortOrder), asc(blogPosts.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

const blogSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  imageUrl: z.string().optional().nullable(),
  category: z.string().default("mindset"),
  readTime: z.string().optional(),
  published: z.boolean().default(false),
  featured: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

router.post("/blog", requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = blogSchema.parse(req.body);
    const db = await getDb();
    await db.insert(blogPosts).values({
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt,
      content: data.content,
      imageUrl: data.imageUrl,
      category: data.category,
      readTime: data.readTime,
      published: data.published,
      featured: data.featured,
      sortOrder: data.sortOrder,
    });
    const [inserted] = await db.select({ id: blogPosts.id }).from(blogPosts).orderBy(asc(blogPosts.createdAt)).limit(1);
    res.json({ success: true, id: inserted?.id ?? 0 });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/blog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const data = blogSchema.partial().parse(req.body);
    const db = await getDb();
    await db.update(blogPosts).set({ ...data, updatedAt: new Date() }).where(eq(blogPosts.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/blog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const db = await getDb();
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Digital Products ─────────────────────────────────────────────────────────
router.get("/digital", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(digitalProducts).orderBy(asc(digitalProducts.sortOrder), asc(digitalProducts.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

const digitalSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  category: z.string().default("guide"),
  productType: z.enum(["pdf", "audiobook", "video", "other"]).default("pdf"),
  imageUrl: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
  audioUrl: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  badge: z.string().optional().nullable(),
  stripePaymentLink: z.string().optional().nullable(),
  published: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

router.post("/digital", requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = digitalSchema.parse(req.body);
    const db = await getDb();
    await db.insert(digitalProducts).values({
      name: data.name,
      description: data.description,
      price: String(data.price),
      category: data.category,
      productType: data.productType,
      imageUrl: data.imageUrl,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      audioUrl: data.audioUrl,
      duration: data.duration,
      badge: data.badge,
      stripePaymentLink: data.stripePaymentLink,
      published: data.published,
      sortOrder: data.sortOrder,
    });
    const [inserted] = await db.select({ id: digitalProducts.id }).from(digitalProducts).orderBy(asc(digitalProducts.createdAt)).limit(1);
    res.json({ success: true, id: inserted?.id ?? 0 });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/digital/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const data = digitalSchema.partial().parse(req.body);
    const db = await getDb();
    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.price !== undefined) updateData.price = String(data.price);
    await db.update(digitalProducts).set(updateData).where(eq(digitalProducts.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/digital/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const db = await getDb();
    await db.delete(digitalProducts).where(eq(digitalProducts.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Site Settings ────────────────────────────────────────────────────────────
router.get("/settings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(siteSettings);
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value ?? "";
    res.json(map);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/settings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body;
    const db = await getDb();
    const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(siteSettings).set({ value, updatedAt: new Date() }).where(eq(siteSettings.key, key));
    } else {
      await db.insert(siteSettings).values({ key, value, updatedAt: new Date() });
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Bulk save settings — accepts {key: value, ...} object
router.post("/settings/bulk", requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = req.body as Record<string, string>;
    const db = await getDb();
    for (const [key, value] of Object.entries(data)) {
      if (typeof key !== 'string' || typeof value !== 'string') continue;
      const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
      if (existing.length > 0) {
        await db.update(siteSettings).set({ value, updatedAt: new Date() }).where(eq(siteSettings.key, key));
      } else {
        await db.insert(siteSettings).values({ key, value, updatedAt: new Date() });
      }
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Printify Proxy ───────────────────────────────────────────────────────────
// Proxies requests to Printify API using stored credentials
async function getPrintifyCredentials() {
  const db = await getDb();
  const rows = await db.select().from(siteSettings)
    .where(eq(siteSettings.key, 'printify_api_key'));
  const shopRows = await db.select().from(siteSettings)
    .where(eq(siteSettings.key, 'printify_shop_id'));
  return {
    apiKey: rows[0]?.value || '',
    shopId: shopRows[0]?.value || '',
  };
}

router.get("/printify/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, shopId } = await getPrintifyCredentials();
    res.json({ connected: !!(apiKey && shopId), shopId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/printify/credentials", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, shopId } = req.body;
    const db = await getDb();
    for (const [key, value] of [['printify_api_key', apiKey], ['printify_shop_id', shopId]]) {
      const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
      if (existing.length > 0) {
        await db.update(siteSettings).set({ value, updatedAt: new Date() }).where(eq(siteSettings.key, key));
      } else {
        await db.insert(siteSettings).values({ key, value, updatedAt: new Date() });
      }
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/printify/products", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, shopId } = await getPrintifyCredentials();
    if (!apiKey || !shopId) { res.status(400).json({ error: 'Printify not configured' }); return; }
    const page = parseInt(req.query.page as string) || 1;
    const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json?page=${page}&limit=20`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await r.json();
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/printify/orders", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, shopId } = await getPrintifyCredentials();
    if (!apiKey || !shopId) { res.status(400).json({ error: 'Printify not configured' }); return; }
    const page = parseInt(req.query.page as string) || 1;
    const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/orders.json?page=${page}&limit=20`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await r.json();
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/printify/import", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { printifyProductId, name, description, price, imageUrl } = req.body;
    const db = await getDb();
    const [inserted] = await db.insert(products).values({
      name, description, price: String(price), imageUrl,
      printifyProductId, category: 'apparel', sizes: ['S','M','L','XL','XXL'],
      inStock: true, published: false,
    }).$returningId();
    res.json({ success: true, id: inserted?.id ?? 0 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Shopify Proxy ────────────────────────────────────────────────────────────
async function getShopifyCredentials() {
  const db = await getDb();
  const urlRows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'shopify_store_url'));
  const keyRows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'shopify_api_key'));
  return {
    storeUrl: urlRows[0]?.value || '',
    apiKey: keyRows[0]?.value || '',
  };
}

router.get("/shopify/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = await getShopifyCredentials();
    res.json({ connected: !!(storeUrl && apiKey), storeUrl });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/shopify/credentials", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = req.body;
    const db = await getDb();
    for (const [key, value] of [['shopify_store_url', storeUrl], ['shopify_api_key', apiKey]]) {
      const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
      if (existing.length > 0) {
        await db.update(siteSettings).set({ value, updatedAt: new Date() }).where(eq(siteSettings.key, key));
      } else {
        await db.insert(siteSettings).values({ key, value, updatedAt: new Date() });
      }
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/shopify/products", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = await getShopifyCredentials();
    if (!storeUrl || !apiKey) { res.status(400).json({ error: 'Shopify not configured' }); return; }
    const url = storeUrl.startsWith('http') ? storeUrl : `https://${storeUrl}`;
    const r = await fetch(`${url}/admin/api/2024-01/products.json?limit=20`, {
      headers: { 'X-Shopify-Access-Token': apiKey },
    });
    const data = await r.json();
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/shopify/orders", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = await getShopifyCredentials();
    if (!storeUrl || !apiKey) { res.status(400).json({ error: 'Shopify not configured' }); return; }
    const url = storeUrl.startsWith('http') ? storeUrl : `https://${storeUrl}`;
    const r = await fetch(`${url}/admin/api/2024-01/orders.json?limit=20&status=any`, {
      headers: { 'X-Shopify-Access-Token': apiKey },
    });
    const data = await r.json();
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/shopify/import", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { shopifyProductId, shopifyVariantId, name, description, price, imageUrl } = req.body;
    const db = await getDb();
    const [inserted] = await db.insert(products).values({
      name, description, price: String(price), imageUrl,
      shopifyProductId, shopifyVariantId, category: 'apparel', sizes: ['S','M','L','XL','XXL'],
      inStock: true, published: false,
    }).$returningId();
    res.json({ success: true, id: inserted?.id ?? 0 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI Chat ──────────────────────────────────────────────────────────────────
router.get("/aichat/config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const keys = ['ai_chat_enabled', 'ai_chat_persona', 'ai_chat_greeting'];
    const rows = await db.select().from(siteSettings);
    const map: Record<string, string> = {};
    for (const row of rows) if (keys.includes(row.key)) map[row.key] = row.value ?? '';
    res.json({
      enabled: map['ai_chat_enabled'] === 'true',
      persona: map['ai_chat_persona'] || 'You are a helpful customer service assistant for Build Level, a premium streetwear brand. Be friendly, concise, and helpful.',
      greeting: map['ai_chat_greeting'] || 'Hey! Welcome to Build Level. How can I help you today?',
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/aichat/config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { enabled, persona, greeting } = req.body;
    const db = await getDb();
    const updates: Record<string, string> = {
      ai_chat_enabled: String(enabled),
      ai_chat_persona: persona || '',
      ai_chat_greeting: greeting || '',
    };
    for (const [key, value] of Object.entries(updates)) {
      const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
      if (existing.length > 0) {
        await db.update(siteSettings).set({ value, updatedAt: new Date() }).where(eq(siteSettings.key, key));
      } else {
        await db.insert(siteSettings).values({ key, value, updatedAt: new Date() });
      }
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI Videos ──────────────────────────────────────────────────────────────────────────────
router.get("/videos", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(aiVideos).orderBy(asc(aiVideos.sortOrder));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/videos", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const data = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      videoUrl: z.string().url(),
      thumbnailUrl: z.string().optional(),
      category: z.string().optional(),
      duration: z.string().optional(),
      published: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }).parse(req.body);
    const [row] = await db.insert(aiVideos).values({ ...data, updatedAt: new Date() } as typeof aiVideos.$inferInsert).$returningId();
    const [created] = await db.select().from(aiVideos).where(eq(aiVideos.id, row.id));
    res.json(created);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/videos/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const id = Number(req.params.id);
    await db.update(aiVideos).set({ ...req.body, updatedAt: new Date() }).where(eq(aiVideos.id, id));
    const [row] = await db.select().from(aiVideos).where(eq(aiVideos.id, id));
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/videos/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    await db.delete(aiVideos).where(eq(aiVideos.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Affiliate Products ──────────────────────────────────────────────────────────────────────────────
router.get("/affiliate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(affiliateProducts).orderBy(asc(affiliateProducts.sortOrder));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/affiliate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(affiliateProducts).values({ ...req.body, updatedAt: new Date() }).$returningId();
    const [created] = await db.select().from(affiliateProducts).where(eq(affiliateProducts.id, row.id));
    res.json(created);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/affiliate/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const id = Number(req.params.id);
    await db.update(affiliateProducts).set({ ...req.body, updatedAt: new Date() }).where(eq(affiliateProducts.id, id));
    const [row] = await db.select().from(affiliateProducts).where(eq(affiliateProducts.id, id));
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/affiliate/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    await db.delete(affiliateProducts).where(eq(affiliateProducts.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Membership Tiers ──────────────────────────────────────────────────────────────────────────────
router.get("/membership", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(membershipTiers).orderBy(asc(membershipTiers.sortOrder));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/membership", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const [row] = await db.insert(membershipTiers).values({ ...req.body, updatedAt: new Date() }).$returningId();
    const [created] = await db.select().from(membershipTiers).where(eq(membershipTiers.id, row.id));
    res.json(created);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/membership/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const id = Number(req.params.id);
    await db.update(membershipTiers).set({ ...req.body, updatedAt: new Date() }).where(eq(membershipTiers.id, id));
    const [row] = await db.select().from(membershipTiers).where(eq(membershipTiers.id, id));
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/membership/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    await db.delete(membershipTiers).where(eq(membershipTiers.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── AI Chat Sessions (admin view) ──────────────────────────────────────────────────────────────────────────────
router.get("/ai-chat/sessions", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    // Group chat messages by sessionId and get summary
    const [rows] = await (db as any).execute(
      `SELECT sessionId, MAX(content) as lastMessage, COUNT(*) as messageCount, MAX(createdAt) as lastActivity
       FROM chat_messages GROUP BY sessionId ORDER BY lastActivity DESC LIMIT 50`
    );
    res.json({ sessions: rows || [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/ai-chat/sessions/:sessionId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const [rows] = await (db as any).execute(
      `SELECT * FROM chat_messages WHERE sessionId = ? ORDER BY createdAt ASC`,
      [req.params.sessionId]
    );
    res.json({ messages: rows || [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;

