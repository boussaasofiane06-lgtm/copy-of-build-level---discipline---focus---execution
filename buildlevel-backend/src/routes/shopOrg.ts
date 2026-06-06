import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { requireAdmin } from "../middleware/adminAuth.js";

const router = Router();
let ensured = false;

const audiences = [
  ["for-you", "For You", 1, 0],
  ["mens", "Men", 1, 10],
  ["womens", "Women", 1, 20],
  ["kids", "Kids", 1, 30],
  ["accessories", "Accessories", 1, 40],
  ["home-living", "Home & Living", 1, 50],
] as const;

const forYouFeatured = ["New Arrivals", "Bestsellers", "New Mockups", "My Favorites"];
const forYouTrends = ["Back to School", "Jewelry", "On Sale", "Eco-Friendly", "Assembled in the USA", "TikTok", "Streetwear", "Summer of Soccer 2026", "4th of July"];
const forYouRecommended = ["Top Picks", "New Arrivals", "Embroidery", "Engraving", "AOP Clothing", "Personalization Picks", "Early Access", "Printify Choice"];
const audienceFeatured: Record<string, string[]> = {
  mens: ["New Arrivals", "Bestsellers"],
  womens: ["New Arrivals", "Bestsellers"],
  kids: ["Bestsellers"],
  accessories: ["New Arrivals", "Bestsellers"],
  "home-living": ["New Arrivals", "Bestsellers"],
};
const audienceCategories: Record<string, string[]> = {
  mens: ["Sweatshirts", "Hoodies", "T-Shirts", "Long Sleeves", "Tank Tops", "Sportswear", "Bottoms", "Swimwear", "Shoes", "Outerwear"],
  womens: ["Sweatshirts", "T-Shirts", "Hoodies", "Long Sleeves", "Tank Tops", "Skirts & Dresses", "Sportswear", "Bottoms", "Swimwear", "Shoes", "Outerwear"],
  kids: ["T-Shirts", "Long Sleeves", "Sweatshirts", "Baby Clothing", "Sportswear", "Bottoms", "Other"],
  accessories: ["Jewelry", "Books", "Phone Cases", "Bags", "Socks", "Hats", "Underwear", "Baby Accessories", "Mouse Pads", "Pets", "Kitchen Accessories", "Car Accessories", "Tech Accessories", "Travel Accessories", "Stationery Accessories", "Sports & Games", "Face Masks", "Other"],
  "home-living": ["Mugs", "Candles", "Ornaments", "Seasonal Decorations", "Glassware", "Bottles & Tumblers", "Canvas", "Posters", "Postcards", "Journals & Notebooks", "Magnets & Stickers", "Home Décor", "Blankets", "Pillows & Covers", "Towels", "Bathroom", "Rugs & Mats", "Bedding", "Food, Health & Beauty"],
};

function slugify(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function ensureShopOrgTables() {
  if (ensured) return;
  const db = await getDb();
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS shop_audiences (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, slug VARCHAR(160) NOT NULL UNIQUE, description TEXT NULL, imageUrl TEXT NULL, icon VARCHAR(64) NULL, displayOrder INT NOT NULL DEFAULT 0, enabled BOOLEAN NOT NULL DEFAULT true, hidden BOOLEAN NOT NULL DEFAULT false, featured BOOLEAN NOT NULL DEFAULT false, draft BOOLEAN NOT NULL DEFAULT false, published BOOLEAN NOT NULL DEFAULT true, isForYou BOOLEAN NOT NULL DEFAULT false, badgeText VARCHAR(80) NULL, badgeStyle VARCHAR(80) NULL, highlightStartAt TIMESTAMP NULL, highlightEndAt TIMESTAMP NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS shop_categories (id INT AUTO_INCREMENT PRIMARY KEY, audienceId INT NOT NULL, parentId INT NULL, name VARCHAR(160) NOT NULL, slug VARCHAR(160) NOT NULL, description TEXT NULL, imageUrl TEXT NULL, icon VARCHAR(64) NULL, displayOrder INT NOT NULL DEFAULT 0, enabled BOOLEAN NOT NULL DEFAULT true, hidden BOOLEAN NOT NULL DEFAULT false, featured BOOLEAN NOT NULL DEFAULT false, draft BOOLEAN NOT NULL DEFAULT false, published BOOLEAN NOT NULL DEFAULT true, badgeText VARCHAR(80) NULL, badgeStyle VARCHAR(80) NULL, highlightStartAt TIMESTAMP NULL, highlightEndAt TIMESTAMP NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_shop_category_scope (audienceId, parentId, slug), INDEX idx_shop_categories_audience (audienceId))`));
  await db.execute(sql.raw(`ALTER TABLE shop_categories ADD COLUMN categoryType ENUM('category','featured_box','trend','recommended','event') NOT NULL DEFAULT 'category'`)).catch(() => undefined);
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
    await db.execute(sql`INSERT INTO shop_audiences (name, slug, enabled, hidden, displayOrder, isForYou, published) VALUES (${name}, ${slug}, ${enabled}, ${!enabled}, ${order}, ${slug === "for-you"}, true) ON DUPLICATE KEY UPDATE name = VALUES(name), enabled = VALUES(enabled), hidden = VALUES(hidden), displayOrder = VALUES(displayOrder), updatedAt = NOW()`);
  }
  const [audienceRows] = await db.execute(sql`SELECT id, slug FROM shop_audiences`) as any;
  const audienceMap = Object.fromEntries((audienceRows || []).map((row: any) => [row.slug, row.id]));
  const seedCategory = async (audienceSlug: string, name: string, parentSlug = "", categoryType = "category", order = 0) => {
    const parentId = parentSlug ? (await db.execute(sql`SELECT id FROM shop_categories WHERE slug = ${parentSlug} AND audienceId = ${audienceMap[audienceSlug]} LIMIT 1`) as any)[0]?.[0]?.id || null : null;
    await db.execute(sql`INSERT INTO shop_categories (audienceId, parentId, name, slug, displayOrder, enabled, hidden, published, categoryType) VALUES (${audienceMap[audienceSlug]}, ${parentId}, ${name}, ${slugify(name)}, ${order}, true, false, true, ${categoryType}) ON DUPLICATE KEY UPDATE name = VALUES(name), categoryType = VALUES(categoryType), hidden = false, enabled = true, updatedAt = NOW()`);
  };
  for (let index = 0; index < forYouFeatured.length; index += 1) await seedCategory("for-you", forYouFeatured[index], "", "featured_box", index);
  for (let index = 0; index < forYouTrends.length; index += 1) await seedCategory("for-you", forYouTrends[index], "", "trend", index + 20);
  for (let index = 0; index < forYouRecommended.length; index += 1) await seedCategory("for-you", forYouRecommended[index], "", "recommended", index + 50);
  for (const [audienceSlug, items] of Object.entries(audienceFeatured)) for (let index = 0; index < items.length; index += 1) await seedCategory(audienceSlug, items[index], "", "featured_box", index);
  for (const [audienceSlug, items] of Object.entries(audienceCategories)) for (let index = 0; index < items.length; index += 1) await seedCategory(audienceSlug, items[index], "", "category", index + 20);

  const [coolers] = await db.execute(sql`SELECT id FROM products WHERE name LIKE '%Can Cooler%' OR name LIKE '%Koozie%' LIMIT 5`) as any;
  const [homeRows] = await db.execute(sql`SELECT id FROM shop_audiences WHERE slug = 'home-living' LIMIT 1`) as any;
  const [canRows] = await db.execute(sql`SELECT id FROM shop_categories WHERE slug = 'bottles-and-tumblers' AND audienceId = ${homeRows?.[0]?.id || 0} LIMIT 1`) as any;
  for (const product of coolers || []) {
    await db.execute(sql`INSERT INTO product_audience_assignments (productId, audienceId, locked) VALUES (${product.id}, ${homeRows?.[0]?.id || 0}, true) ON DUPLICATE KEY UPDATE audienceId = VALUES(audienceId), locked = true, updatedAt = NOW()`);
    if (canRows?.[0]) await db.execute(sql`INSERT INTO product_category_assignments (productId, categoryId, assignmentType) VALUES (${product.id}, ${canRows[0].id}, 'primary') ON DUPLICATE KEY UPDATE updatedAt = NOW()`);
    await db.execute(sql`UPDATE products SET category = 'bottles-and-tumblers', updatedAt = NOW() WHERE id = ${product.id}`);
  }
  await db.execute(sql.raw(`
    INSERT INTO shop_events (name, slug, description, displayOrder, enabled, hidden, published)
    SELECT name, slug, description, displayOrder, enabled, hidden, published
    FROM shop_audiences
    WHERE slug NOT IN ('for-you','mens','womens','kids','accessories','home-living')
      AND (LOWER(name) LIKE '%4th of july%' OR LOWER(name) LIKE '%mother%' OR LOWER(name) LIKE '%father%' OR LOWER(name) LIKE '%black friday%' OR LOWER(name) LIKE '%christmas%' OR LOWER(name) LIKE '%halloween%' OR LOWER(name) LIKE '%valentine%' OR LOWER(name) LIKE '%new year%' OR LOWER(name) LIKE '%back to school%')
    ON DUPLICATE KEY UPDATE name = VALUES(name), updatedAt = NOW()
  `)).catch(() => undefined);
  await db.execute(sql.raw(`
    INSERT IGNORE INTO product_event_assignments (productId, targetId)
    SELECT paa.productId, e.id
    FROM product_audience_assignments paa
    JOIN shop_audiences a ON a.id = paa.audienceId
    JOIN shop_events e ON e.slug = a.slug
    WHERE a.slug NOT IN ('for-you','mens','womens','kids','accessories','home-living')
  `)).catch(() => undefined);
  await db.execute(sql.raw(`
    UPDATE product_audience_assignments paa
    JOIN shop_audiences a ON a.id = paa.audienceId
    JOIN shop_audiences fy ON fy.slug = 'for-you'
    SET paa.audienceId = fy.id, paa.updatedAt = NOW()
    WHERE a.slug NOT IN ('for-you','mens','womens','kids','accessories','home-living')
  `)).catch(() => undefined);
  await db.execute(sql.raw(`
    DELETE FROM shop_audiences
    WHERE slug NOT IN ('for-you','mens','womens','kids','accessories','home-living')
      AND (LOWER(name) LIKE '%4th of july%' OR LOWER(name) LIKE '%mother%' OR LOWER(name) LIKE '%father%' OR LOWER(name) LIKE '%black friday%' OR LOWER(name) LIKE '%christmas%' OR LOWER(name) LIKE '%halloween%' OR LOWER(name) LIKE '%valentine%' OR LOWER(name) LIKE '%new year%' OR LOWER(name) LIKE '%back to school%')
  `)).catch(() => undefined);
  await db.execute(sql.raw(`DELETE a1 FROM shop_audiences a1 JOIN shop_audiences a2 ON a1.slug = a2.slug AND a1.id > a2.id`)).catch(() => undefined);
  await db.execute(sql.raw(`DELETE c1 FROM shop_categories c1 JOIN shop_categories c2 ON c1.audienceId = c2.audienceId AND COALESCE(c1.parentId, 0) = COALESCE(c2.parentId, 0) AND c1.slug = c2.slug AND c1.id > c2.id`)).catch(() => undefined);
  ensured = true;
}

function uniqueRows<T extends Record<string, any>>(rows: T[], keyFn: (row: T) => string) {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = keyFn(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getTaxonomy(includeHidden = false) {
  await ensureShopOrgTables();
  const db = await getDb();
  const hiddenFilter = includeHidden ? sql`1=1` : sql`enabled = true AND hidden = false AND draft = false AND published = true`;
  const [audiences] = await db.execute(sql`SELECT * FROM shop_audiences WHERE ${hiddenFilter} ORDER BY displayOrder, id`) as any;
  const [categories] = await db.execute(sql`SELECT c.*, a.slug AS audienceSlug FROM shop_categories c JOIN shop_audiences a ON a.id = c.audienceId WHERE ${includeHidden ? sql`1=1` : sql`c.enabled = true AND c.hidden = false AND c.draft = false AND c.published = true`} ORDER BY c.displayOrder, c.name`) as any;
  const [assignments] = await db.execute(sql`SELECT paa.productId, a.slug AS audienceSlug, a.name AS audienceName, pc.assignmentType, c.slug AS categorySlug, c.name AS categoryName, c.parentId FROM product_audience_assignments paa JOIN shop_audiences a ON a.id = paa.audienceId LEFT JOIN product_category_assignments pc ON pc.productId = paa.productId LEFT JOIN shop_categories c ON c.id = pc.categoryId`) as any;
  const [events] = await db.execute(sql`SELECT * FROM shop_events WHERE ${includeHidden ? sql`1=1` : sql`enabled = true AND hidden = false AND draft = false AND published = true`} ORDER BY displayOrder, id`) as any;
  return {
    audiences: uniqueRows(audiences || [], row => String(row.slug)),
    categories: uniqueRows(categories || [], row => `${row.audienceId}:${row.parentId || 0}:${row.slug}`),
    productAssignments: uniqueRows(assignments || [], row => `${row.productId}:${row.audienceSlug}:${row.assignmentType || ""}:${row.categorySlug || ""}`),
    events: uniqueRows(events || [], row => String(row.slug)),
  };
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
  categoryType: z.enum(["category", "featured_box", "trend", "recommended", "event"]).optional().default("category"),
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

router.delete("/admin/shop/audiences/:id", requireAdmin, async (req, res) => {
  try {
    await ensureShopOrgTables();
    const id = Number(req.params.id);
    const db = await getDb();
    const [categoryRows] = await db.execute(sql`SELECT COUNT(*) AS count FROM shop_categories WHERE audienceId = ${id}`) as any;
    const [productRows] = await db.execute(sql`SELECT COUNT(*) AS count FROM product_audience_assignments WHERE audienceId = ${id}`) as any;
    if (Number(categoryRows?.[0]?.count || 0) > 0 || Number(productRows?.[0]?.count || 0) > 0) {
      res.status(409).json({ error: "Audience contains categories or assigned products. Reassign or archive them before deleting." });
      return;
    }
    await db.execute(sql`DELETE FROM shop_audiences WHERE id = ${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/admin/shop/categories", requireAdmin, async (req, res) => {
  try {
    await ensureShopOrgTables();
    const data = entitySchema.extend({ audienceId: z.number(), parentId: z.number().nullable().optional() }).parse(req.body);
    const db = await getDb();
    const nextSlug = data.slug || slugify(data.name);
    const [existing] = await db.execute(sql`SELECT id FROM shop_categories WHERE audienceId = ${data.audienceId} AND COALESCE(parentId, 0) = ${data.parentId || 0} AND (slug = ${nextSlug} OR LOWER(name) = ${data.name.trim().toLowerCase()}) LIMIT 1`) as any;
    if (existing?.[0]) { res.status(409).json({ error: "A category with this name or slug already exists." }); return; }
    await db.execute(sql`INSERT INTO shop_categories (audienceId, parentId, name, slug, description, imageUrl, icon, displayOrder, enabled, hidden, featured, published, styleSettings, categoryType) VALUES (${data.audienceId}, ${data.parentId || null}, ${data.name}, ${nextSlug}, ${data.description}, ${data.imageUrl}, ${data.icon}, ${data.displayOrder}, ${data.enabled}, ${data.hidden}, ${data.featured}, ${data.published}, ${JSON.stringify(sanitizeStyleSettings(data.styleSettings))}, ${data.categoryType})`);
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

router.delete("/admin/shop/categories/:id", requireAdmin, async (req, res) => {
  try {
    await ensureShopOrgTables();
    const id = Number(req.params.id);
    const db = await getDb();
    const [childRows] = await db.execute(sql`SELECT COUNT(*) AS count FROM shop_categories WHERE parentId = ${id}`) as any;
    const [productRows] = await db.execute(sql`SELECT COUNT(*) AS count FROM product_category_assignments WHERE categoryId = ${id}`) as any;
    if (Number(childRows?.[0]?.count || 0) > 0 || Number(productRows?.[0]?.count || 0) > 0) {
      res.status(409).json({ error: "Category contains subcategories or assigned products. Reassign or archive them before deleting." });
      return;
    }
    await db.execute(sql`DELETE FROM shop_categories WHERE id = ${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

for (const [path, table] of [["collections", "shop_collections"], ["trends", "shop_trends"], ["events", "shop_events"], ["recommended-groups", "shop_recommended_groups"]] as const) {
  router.post(`/admin/shop/${path}`, requireAdmin, async (req, res) => {
    try { await ensureShopOrgTables(); const data = entitySchema.parse(req.body); const db = await getDb(); await db.execute(sql`INSERT INTO ${sql.raw(table)} (name, slug, description, imageUrl, icon, displayOrder, enabled, hidden, featured, published) VALUES (${data.name}, ${data.slug || slugify(data.name)}, ${data.description}, ${data.imageUrl}, ${data.icon}, ${data.displayOrder}, ${data.enabled}, ${data.hidden}, ${data.featured}, ${data.published})`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  router.put(`/admin/shop/${path}/:id`, requireAdmin, async (req, res) => {
    try { await ensureShopOrgTables(); const data = entitySchema.partial().parse(req.body); const db = await getDb(); await db.execute(sql`UPDATE ${sql.raw(table)} SET name = COALESCE(${data.name ?? null}, name), slug = COALESCE(${data.slug ?? null}, slug), description = COALESCE(${data.description ?? null}, description), displayOrder = COALESCE(${data.displayOrder ?? null}, displayOrder), enabled = COALESCE(${data.enabled ?? null}, enabled), hidden = COALESCE(${data.hidden ?? null}, hidden), published = COALESCE(${data.published ?? null}, published), updatedAt = NOW() WHERE id = ${Number(req.params.id)}`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  router.delete(`/admin/shop/${path}/:id`, requireAdmin, async (req, res) => {
    try { await ensureShopOrgTables(); const db = await getDb(); await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE id = ${Number(req.params.id)}`); res.json({ success: true }); } catch (e: any) { res.status(400).json({ error: e.message }); }
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
