import { Router, Request, Response } from "express";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import {
  products, blogPosts, digitalProducts, affiliateProducts,
  membershipTiers, siteSettings
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

export default router;
