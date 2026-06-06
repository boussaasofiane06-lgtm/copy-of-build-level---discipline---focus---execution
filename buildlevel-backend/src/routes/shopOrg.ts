import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { requireAdmin } from "../middleware/adminAuth.js";

const router = Router();
let ensured = false;

const audiences = [
  ["for-you", "For You", 0, 0],
  ["mens", "Men", 1, 10],
  ["womens", "Women", 1, 20],
  ["kids", "Kids", 1, 30],
  ["accessories", "Accessories", 1, 40],
  ["home-living", "Home & Living", 1, 50],
] as const;

const accessoryCategories = ["Jewelry", "Books", "Phone Cases", "Bags", "Socks", "Hats", "Underwear", "Baby Accessories", "Mouse Pads", "Pet Accessories", "Kitchen Accessories", "Car Accessories", "Tech Accessories", "Travel Accessories", "Stationery Accessories", "Sports & Games", "Face Masks", "Keychains", "Stickers", "Other Accessories"];
const homeCategories = ["Drinkware", "Can Coolers", "Mugs", "Glassware", "Bottles & Tumblers", "Candles", "Ornaments", "Seasonal Decorations", "Canvas", "Posters", "Postcards", "Journals & Notebooks", "Magnets & Stickers", "Home Décor", "Blankets", "Pillows & Covers", "Towels", "Bathroom", "Rugs & Mats", "Bedding", "Food, Health & Beauty", "Other Home & Living"];
const legacyCategories: Array<[string, string, string]> = [
  ["mens", "mens-t-shirts", "T-Shirts"], ["mens", "mens-hoodies", "Hoodies"], ["mens", "mens-hats", "Hats"],
  ["womens", "womens-t-shirts", "T-Shirts"], ["womens", "womens-hoodies", "Hoodies"], ["womens", "womens-hats", "Hats"],
  ["kids", "kids-t-shirts", "Kids T-Shirts"], ["kids", "kids-hoodies", "Kids Hoodies"], ["kids", "kids-hats", "Kids Hats"],
];
const trends = ["Back to School", "On Sale", "Eco-Friendly", "Assembled in the USA", "Streetwear", "Summer of Soccer 2026", "4th of July"];
const groups = ["Top Picks", "New Arrivals", "Embroidery", "Engraving", "AOP Clothing", "Personalization Picks", "Early Access", "Printify Choice"];

function slugify(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function ensureShopOrgTables() {
  if (ensured) return;
  const db = await getDb();
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS shop_audiences (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, slug VARCHAR(160) NOT NULL UNIQUE, description TEXT NULL, imageUrl TEXT NULL, icon VARCHAR(64) NULL, displayOrder INT NOT NULL DEFAULT 0, enabled BOOLEAN NOT NULL DEFAULT true, hidden BOOLEAN NOT NULL DEFAULT false, featured BOOLEAN NOT NULL DEFAULT false, draft BOOLEAN NOT NULL DEFAULT false, published BOOLEAN NOT NULL DEFAULT true, isForYou BOOLEAN NOT NULL DEFAULT false, badgeText VARCHAR(80) NULL, badgeStyle VARCHAR(80) NULL, highlightStartAt TIMESTAMP NULL, highlightEndAt TIMESTAMP NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS shop_categories (id INT AUTO_INCREMENT PRIMARY KEY, audienceId INT NOT NULL, parentId INT NULL, name VARCHAR(160) NOT NULL, slug VARCHAR(160) NOT NULL, description TEXT NULL, imageUrl TEXT NULL, icon VARCHAR(64) NULL, displayOrder INT NOT NULL DEFAULT 0, enabled BOOLEAN NOT NULL DEFAULT true, hidden BOOLEAN NOT NULL DEFAULT false, featured BOOLEAN NOT NULL DEFAULT false, draft BOOLEAN NOT NULL DEFAULT false, published BOOLEAN NOT NULL DEFAULT true, badgeText VARCHAR(80) NULL, badgeStyle VARCHAR(80) NULL, highlightStartAt TIMESTAMP NULL, highlightEndAt TIMESTAMP NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_shop_category_scope (audienceId, parentId, slug), INDEX idx_shop_categories_audience (audienceId))`));
  for (const table of ["shop_collections", "shop_trends", "shop_events", "shop_recommended_groups"]) {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS ${table} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, slug VARCHAR(160) NOT NULL UNIQUE, description TEXT NULL, imageUrl TEXT NULL, icon VARCHAR(64) NULL, displayOrder INT NOT NULL DEFAULT 0, enabled BOOLEAN NOT NULL DEFAULT true, hidden BOOLEAN NOT NULL DEFAULT false, featured BOOLEAN NOT NULL DEFAULT false, draft BOOLEAN NOT NULL DEFAULT false, published BOOLEAN NOT NULL DEFAULT true, badgeText VARCHAR(80) NULL, badgeStyle VARCHAR(80) NULL, startAt TIMESTAMP NULL, endAt TIMESTAMP NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`));
  }
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS product_audience_assignments (id INT AUTO_INCREMENT PRIMARY KEY, productId INT NOT NULL UNIQUE, audienceId INT NOT NULL, locked BOOLEAN NOT NULL DEFAULT false, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_product_audience_product (productId), INDEX idx_product_audience_audience (audienceId))`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS product_category_assignments (id INT AUTO_INCREMENT PRIMARY KEY, productId INT NOT NULL, categoryId INT NOT NULL, assignmentType ENUM('primary','subcategory','secondary') NOT NULL DEFAULT 'primary', createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_product_category_assignment (productId, categoryId, assignmentType), INDEX idx_product_category_product (productId), INDEX idx_product_category_category (categoryId))`));
  for (const table of ["product_collection_assignments", "product_trend_assignments", "product_event_assignments", "product_recommended_assignments"]) {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS ${table} (id INT AUTO_INCREMENT PRIMARY KEY, productId INT NOT NULL, targetId INT NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_${table} (productId, targetId), INDEX idx_${table}_product (productId), INDEX idx_${table}_target (targetId))`));
  }
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS navigation_items (id INT AUTO_INCREMENT PRIMARY KEY, itemType ENUM('audience','collection','trend','event','custom') NOT NULL, targetId INT NULL, label VARCHAR(160) NOT NULL, slug VARCHAR(160) NOT NULL, displayOrder INT NOT NULL DEFAULT 0, enabled BOOLEAN NOT NULL DEFAULT true, hidden BOOLEAN NOT NULL DEFAULT false, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`));
  for (const table of ["shop_audiences", "shop_categories", "shop_collections", "shop_trends", "shop_events", "shop_recommended_groups"]) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN styleSettings JSON NULL`)).catch(() => undefined);
  }

  for (const [slug, name, enabled, order] of audiences) {
    await db.execute(sql`INSERT INTO shop_audiences (name, slug, enabled, hidden, displayOrder, isForYou, published) VALUES (${name}, ${slug}, ${enabled === 1}, ${enabled === 0}, ${order}, ${slug === "for-you"}, true) ON DUPLICATE KEY UPDATE name = VALUES(name), displayOrder = VALUES(displayOrder), updatedAt = NOW()`);
  }
  const [audienceRows] = await db.execute(sql`SELECT id, slug FROM shop_audiences`) as any;
  const audienceMap = Object.fromEntries((audienceRows || []).map((row: any) => [row.slug, row.id]));
  const seedCategory = async (audienceSlug: string, name: string, parentSlug = "") => {
    const parentId = parentSlug ? (await db.execute(sql`SELECT id FROM shop_categories WHERE slug = ${parentSlug} AND audienceId = ${audienceMap[audienceSlug]} LIMIT 1`) as any)[0]?.[0]?.id || null : null;
    await db.execute(sql`INSERT INTO shop_categories (audienceId, parentId, name, slug, displayOrder, enabled, published) VALUES (${audienceMap[audienceSlug]}, ${parentId}, ${name}, ${slugify(name)}, 0, true, true) ON DUPLICATE KEY UPDATE name = VALUES(name), updatedAt = NOW()`);
  };
  for (const [audienceSlug, slug, label] of legacyCategories) await db.execute(sql`INSERT INTO shop_categories (audienceId, parentId, name, slug, displayOrder, enabled, published) VALUES (${audienceMap[audienceSlug]}, NULL, ${label}, ${slug}, 0, true, true) ON DUPLICATE KEY UPDATE name = VALUES(name), updatedAt = NOW()`);
  for (const name of accessoryCategories) await seedCategory("accessories", name);
  for (const name of homeCategories) await seedCategory("home-living", name);
  await seedCategory("home-living", "Can Coolers", "drinkware");
  for (const name of trends) await db.execute(sql`INSERT INTO shop_trends (name, slug, enabled, published) VALUES (${name}, ${slugify(name)}, true, true) ON DUPLICATE KEY UPDATE name = VALUES(name), updatedAt = NOW()`);
  for (const name of groups) await db.execute(sql`INSERT INTO shop_recommended_groups (name, slug, enabled, published) VALUES (${name}, ${slugify(name)}, true, true) ON DUPLICATE KEY UPDATE name = VALUES(name), updatedAt = NOW()`);

  const [coolers] = await db.execute(sql`SELECT id FROM products WHERE name LIKE '%Can Cooler%' OR name LIKE '%Koozie%' LIMIT 5`) as any;
  const [homeRows] = await db.execute(sql`SELECT id FROM shop_audiences WHERE slug = 'home-living' LIMIT 1`) as any;
  const [drinkwareRows] = await db.execute(sql`SELECT id FROM shop_categories WHERE slug = 'drinkware' AND audienceId = ${homeRows?.[0]?.id || 0} LIMIT 1`) as any;
  const [canRows] = await db.execute(sql`SELECT id FROM shop_categories WHERE slug = 'can-coolers' AND audienceId = ${homeRows?.[0]?.id || 0} LIMIT 1`) as any;
  for (const product of coolers || []) {
    await db.execute(sql`INSERT INTO product_audience_assignments (productId, audienceId, locked) VALUES (${product.id}, ${homeRows?.[0]?.id || 0}, true) ON DUPLICATE KEY UPDATE audienceId = VALUES(audienceId), locked = true, updatedAt = NOW()`);
    if (drinkwareRows?.[0]) await db.execute(sql`INSERT INTO product_category_assignments (productId, categoryId, assignmentType) VALUES (${product.id}, ${drinkwareRows[0].id}, 'primary') ON DUPLICATE KEY UPDATE updatedAt = NOW()`);
    if (canRows?.[0]) await db.execute(sql`INSERT INTO product_category_assignments (productId, categoryId, assignmentType) VALUES (${product.id}, ${canRows[0].id}, 'subcategory') ON DUPLICATE KEY UPDATE updatedAt = NOW()`);
    await db.execute(sql`UPDATE products SET category = 'can-coolers', updatedAt = NOW() WHERE id = ${product.id}`);
  }
  ensured = true;
}

async function getTaxonomy(includeHidden = false) {
  await ensureShopOrgTables();
  const db = await getDb();
  const hiddenFilter = includeHidden ? sql`1=1` : sql`enabled = true AND hidden = false AND draft = false AND published = true`;
  const [audiences] = await db.execute(sql`SELECT * FROM shop_audiences WHERE ${hiddenFilter} ORDER BY displayOrder, id`) as any;
  const [categories] = await db.execute(sql`SELECT c.*, a.slug AS audienceSlug FROM shop_categories c JOIN shop_audiences a ON a.id = c.audienceId WHERE ${includeHidden ? sql`1=1` : sql`c.enabled = true AND c.hidden = false AND c.draft = false AND c.published = true`} ORDER BY c.displayOrder, c.name`) as any;
  const [assignments] = await db.execute(sql`SELECT paa.productId, a.slug AS audienceSlug, a.name AS audienceName, pc.assignmentType, c.slug AS categorySlug, c.name AS categoryName, c.parentId FROM product_audience_assignments paa JOIN shop_audiences a ON a.id = paa.audienceId LEFT JOIN product_category_assignments pc ON pc.productId = paa.productId LEFT JOIN shop_categories c ON c.id = pc.categoryId`) as any;
  return { audiences: audiences || [], categories: categories || [], productAssignments: assignments || [] };
}

router.get("/shop/taxonomy", async (_req, res) => {
  try { res.json(await getTaxonomy(false)); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/admin/shop/taxonomy", requireAdmin, async (_req, res) => {
  try { res.json(await getTaxonomy(true)); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

const entitySchema = z.object({
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(160).optional(),
  description: z.string().optional().default(""),
  imageUrl: z.string().optional().default(""),
  icon: z.string().optional().default(""),
  displayOrder: z.number().optional().default(0),
  enabled: z.boolean().optional().default(true),
  hidden: z.boolean().optional().default(false),
  featured: z.boolean().optional().default(false),
  published: z.boolean().optional().default(true),
  styleSettings: z.record(z.string(), z.unknown()).optional().default({}),
});

function sanitizeStyleSettings(value: Record<string, unknown>) {
  const allowedKeys = new Set(["textCase", "fontStyle", "fontSize", "fontWeight", "letterSpacing", "lineHeight", "textAlign", "textColor", "headingColor", "backgroundColor", "borderColor", "buttonColor", "buttonTextColor", "badgeColor", "highlightColor", "hoverColor", "accentColor", "buttonVariant", "buttonSize", "buttonWidth", "buttonRadius", "badgeText", "badgeTextColor", "badgeBackgroundColor", "badgeBorderColor", "badgePosition", "mobileVisible", "desktopVisible"]);
  const clean: Record<string, string | boolean> = {};
  for (const [key, raw] of Object.entries(value || {})) {
    if (!allowedKeys.has(key)) continue;
    if (typeof raw === "boolean") { clean[key] = raw; continue; }
    const text = String(raw ?? "").trim().slice(0, 80);
    if (!text) continue;
    if (/color/i.test(key) && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) continue;
    if (key === "fontSize") {
      const size = Math.max(10, Math.min(42, Number.parseInt(text, 10) || 16));
      clean[key] = String(size);
      continue;
    }
    clean[key] = text.replace(/[{};<>]/g, "");
  }
  return clean;
}

router.post("/admin/shop/audiences", requireAdmin, async (req, res) => {
  try {
    await ensureShopOrgTables();
    const data = entitySchema.extend({ isForYou: z.boolean().optional().default(false) }).parse(req.body);
    const db = await getDb();
    await db.execute(sql`INSERT INTO shop_audiences (name, slug, description, imageUrl, icon, displayOrder, enabled, hidden, featured, published, isForYou, styleSettings) VALUES (${data.name}, ${data.slug || slugify(data.name)}, ${data.description}, ${data.imageUrl}, ${data.icon}, ${data.displayOrder}, ${data.enabled}, ${data.hidden}, ${data.featured}, ${data.published}, ${data.isForYou}, ${JSON.stringify(sanitizeStyleSettings(data.styleSettings))})`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/admin/shop/audiences/:id", requireAdmin, async (req, res) => {
  try {
    await ensureShopOrgTables();
    const data = entitySchema.partial().extend({ isForYou: z.boolean().optional() }).parse(req.body);
    const db = await getDb();
    await db.execute(sql`UPDATE shop_audiences SET name = COALESCE(${data.name ?? null}, name), slug = COALESCE(${data.slug ?? null}, slug), description = COALESCE(${data.description ?? null}, description), imageUrl = COALESCE(${data.imageUrl ?? null}, imageUrl), icon = COALESCE(${data.icon ?? null}, icon), displayOrder = COALESCE(${data.displayOrder ?? null}, displayOrder), enabled = COALESCE(${data.enabled ?? null}, enabled), hidden = COALESCE(${data.hidden ?? null}, hidden), featured = COALESCE(${data.featured ?? null}, featured), published = COALESCE(${data.published ?? null}, published), isForYou = COALESCE(${data.isForYou ?? null}, isForYou), styleSettings = COALESCE(${data.styleSettings ? JSON.stringify(sanitizeStyleSettings(data.styleSettings)) : null}, styleSettings), updatedAt = NOW() WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/admin/shop/categories", requireAdmin, async (req, res) => {
  try {
    await ensureShopOrgTables();
    const data = entitySchema.extend({ audienceId: z.number(), parentId: z.number().nullable().optional() }).parse(req.body);
    const db = await getDb();
    await db.execute(sql`INSERT INTO shop_categories (audienceId, parentId, name, slug, description, imageUrl, icon, displayOrder, enabled, hidden, featured, published, styleSettings) VALUES (${data.audienceId}, ${data.parentId || null}, ${data.name}, ${data.slug || slugify(data.name)}, ${data.description}, ${data.imageUrl}, ${data.icon}, ${data.displayOrder}, ${data.enabled}, ${data.hidden}, ${data.featured}, ${data.published}, ${JSON.stringify(sanitizeStyleSettings(data.styleSettings))})`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/admin/shop/categories/:id", requireAdmin, async (req, res) => {
  try {
    await ensureShopOrgTables();
    const data = entitySchema.partial().extend({ audienceId: z.number().optional(), parentId: z.number().nullable().optional() }).parse(req.body);
    const db = await getDb();
    await db.execute(sql`UPDATE shop_categories SET audienceId = COALESCE(${data.audienceId ?? null}, audienceId), parentId = ${data.parentId === undefined ? sql.raw("parentId") : data.parentId || null}, name = COALESCE(${data.name ?? null}, name), slug = COALESCE(${data.slug ?? null}, slug), description = COALESCE(${data.description ?? null}, description), imageUrl = COALESCE(${data.imageUrl ?? null}, imageUrl), icon = COALESCE(${data.icon ?? null}, icon), displayOrder = COALESCE(${data.displayOrder ?? null}, displayOrder), enabled = COALESCE(${data.enabled ?? null}, enabled), hidden = COALESCE(${data.hidden ?? null}, hidden), featured = COALESCE(${data.featured ?? null}, featured), published = COALESCE(${data.published ?? null}, published), styleSettings = COALESCE(${data.styleSettings ? JSON.stringify(sanitizeStyleSettings(data.styleSettings)) : null}, styleSettings), updatedAt = NOW() WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

for (const [path, table] of [["collections", "shop_collections"], ["trends", "shop_trends"], ["events", "shop_events"], ["recommended-groups", "shop_recommended_groups"]] as const) {
  router.post(`/admin/shop/${path}`, requireAdmin, async (req, res) => {
    try { await ensureShopOrgTables(); const data = entitySchema.parse(req.body); const db = await getDb(); await db.execute(sql`INSERT INTO ${sql.raw(table)} (name, slug, description, imageUrl, icon, displayOrder, enabled, hidden, featured, published) VALUES (${data.name}, ${data.slug || slugify(data.name)}, ${data.description}, ${data.imageUrl}, ${data.icon}, ${data.displayOrder}, ${data.enabled}, ${data.hidden}, ${data.featured}, ${data.published})`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
}

router.put("/admin/shop/products/:id/classification", requireAdmin, async (req, res) => {
  try {
    await ensureShopOrgTables();
    const data = z.object({ audienceId: z.number(), categoryId: z.number().optional(), subcategoryId: z.number().optional() }).parse(req.body);
    const productId = Number(req.params.id);
    const db = await getDb();
    await db.execute(sql`INSERT INTO product_audience_assignments (productId, audienceId, locked) VALUES (${productId}, ${data.audienceId}, true) ON DUPLICATE KEY UPDATE audienceId = VALUES(audienceId), locked = true, updatedAt = NOW()`);
    await db.execute(sql`DELETE FROM product_category_assignments WHERE productId = ${productId} AND assignmentType IN ('primary','subcategory')`);
    if (data.categoryId) await db.execute(sql`INSERT INTO product_category_assignments (productId, categoryId, assignmentType) VALUES (${productId}, ${data.categoryId}, 'primary')`);
    if (data.subcategoryId) await db.execute(sql`INSERT INTO product_category_assignments (productId, categoryId, assignmentType) VALUES (${productId}, ${data.subcategoryId}, 'subcategory')`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
