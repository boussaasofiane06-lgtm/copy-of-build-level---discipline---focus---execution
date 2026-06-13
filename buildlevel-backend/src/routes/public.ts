import { Router } from "express";
import { eq, asc, and, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { Readable } from "stream";
import { getDb } from "../db/index.js";
import { products, blogPosts, digitalProducts, digitalPurchases, affiliateProducts, membershipTiers, siteSettings, orders, orderItems, productVariants } from "../db/schema.js";
import { getProtectedDownloadUrl } from "../storage/objectStorage.js";
import { BUSINESS_EMAIL, isEmailConfigured, sendBusinessEmail, sendCustomerEmail } from "../services/email.js";

const router = Router();
const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "x", "pinterest"] as const;
const DEFAULT_MAINTENANCE = {
  enabled: false,
  title: "Coming Back Soon",
  message: "BUILD LEVEL is upgrading the experience. The storefront will return shortly.",
  returnText: "Discipline. Focus. Execution.",
  contactEmail: "info@thebuildlevel.com",
};

let blogScheduleColumnEnsured = false;
async function ensureBlogScheduleColumn() {
  if (blogScheduleColumnEnsured) return;
  const db = await getDb();
  await db.execute(sql.raw(`ALTER TABLE blog_posts ADD COLUMN scheduledAt TIMESTAMP NULL`)).catch(() => undefined);
  blogScheduleColumnEnsured = true;
}

async function publishDueScheduledBlogs() {
  await ensureBlogScheduleColumn();
  const db = await getDb();
  await db.execute(sql.raw(`UPDATE blog_posts SET published = true, scheduledAt = NULL, updatedAt = NOW() WHERE published = false AND scheduledAt IS NOT NULL AND scheduledAt <= NOW()`)).catch(() => undefined);
}

let digitalScheduleColumnEnsured = false;
async function ensureDigitalScheduleColumn() {
  if (digitalScheduleColumnEnsured) return;
  const db = await getDb();
  await db.execute(sql.raw(`ALTER TABLE digital_products ADD COLUMN scheduledAt TIMESTAMP NULL`)).catch(() => undefined);
  digitalScheduleColumnEnsured = true;
}

async function publishDueScheduledDigitalProducts() {
  await ensureDigitalScheduleColumn();
  const db = await getDb();
  await db.execute(sql.raw(`UPDATE digital_products SET published = true, scheduledAt = NULL, updatedAt = NOW() WHERE published = false AND scheduledAt IS NOT NULL AND scheduledAt <= NOW()`)).catch(() => undefined);
}

function cleanDigitalProductForResponse<T extends { published?: boolean | null; scheduledAt?: Date | string | null; fileKey?: string | null; fileUrl?: string | null; audioUrl?: string | null; stripePaymentLink?: string | null }>(product: T): T {
  if (product.published) return product;
  return { ...product, fileKey: null, fileUrl: null, audioUrl: null, stripePaymentLink: null };
}

function normalizeTidioPublicKey(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  const match = trimmed.match(/code\.tidio\.co\/([^"'\s/]+)\.js/i);
  if (match?.[1]) return match[1];
  return trimmed.replace(/^https?:\/\/code\.tidio\.co\//i, "").replace(/\.js$/i, "");
}

function settingOrEnv(settings: Record<string, string>, key: string, envValue?: string) {
  return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : (envValue || "");
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanPrintifyDescription(value?: string | null) {
  if (!value) return "";
  const decoded = decodeHtmlEntities(decodeHtmlEntities(value));
  const text = decoded
    .replace(/<table[\s\S]*?<\/table>/gi, " ")
    .replace(/<thead[\s\S]*?<\/thead>/gi, " ")
    .replace(/<tbody[\s\S]*?<\/tbody>/gi, " ")
    .replace(/<tr[\s\S]*?<\/tr>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b(Width|Length|Sleeve length|Size tolerance),?\s*in\b[\s\S]*?(?=[A-Z][a-z]{2,}\s|$)/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  const productOnly = text.split(/\bProduct features\b|\bCare instructions\b/i)[0]?.trim() || text;
  return productOnly.slice(0, 2500);
}

function cleanProductDescriptionForResponse<T extends { description?: string | null; printifyProductId?: string | null }>(product: T): T {
  if (!product.printifyProductId || !product.description) return product;
  return { ...product, description: cleanPrintifyDescription(product.description) };
}

function repairProductOptions(options?: string[] | null) {
  if (!Array.isArray(options)) return [];
  const repaired: string[] = [];
  let buffer = "";

  const pushOption = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (/^"?variantId"?\s*:/i.test(trimmed) || /^"?price"?\s*:/i.test(trimmed)) return;
    repaired.push(trimmed);
  };

  for (const option of options) {
    const part = String(option || "").trim();
    if (!part) continue;

    if (buffer) {
      buffer += `,${part}`;
      if (part.includes("}")) {
        try {
          const parsed = JSON.parse(buffer);
          const label = String(parsed?.label || "").trim();
          if (label) {
            repaired.push(JSON.stringify({
              label,
              variantId: parsed?.variantId ? String(parsed.variantId) : undefined,
              price: parsed?.price ? String(parsed.price) : undefined,
            }));
          }
        } catch {
          pushOption(buffer);
        }
        buffer = "";
      }
      continue;
    }

    if (part.startsWith("{") && !part.includes("}")) {
      buffer = part;
      continue;
    }

    if (part.startsWith("{")) {
      try {
        const parsed = JSON.parse(part);
        const label = String(parsed?.label || "").trim();
        if (label) {
          repaired.push(JSON.stringify({
            label,
            variantId: parsed?.variantId ? String(parsed.variantId) : undefined,
            price: parsed?.price ? String(parsed.price) : undefined,
          }));
        }
      } catch {
        pushOption(part);
      }
      continue;
    }

    pushOption(part);
  }

  if (buffer) pushOption(buffer);
  return repaired;
}

function cleanProductForResponse<T extends { description?: string | null; printifyProductId?: string | null; sizes?: string[] | null }>(product: T): T {
  return { ...cleanProductDescriptionForResponse(product), sizes: repairProductOptions(product.sizes) };
}

async function getSettingsMap(keys?: string[]) {
  const db = await getDb();
  const rows = await db.select().from(siteSettings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (!keys || keys.includes(row.key)) map[row.key] = row.value ?? "";
  }
  return map;
}

async function saveSetting(key: string, value: string) {
  const db = await getDb();
  const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(siteSettings).set({ value, updatedAt: new Date() }).where(eq(siteSettings.key, key));
  } else {
    await db.insert(siteSettings).values({ key, value, updatedAt: new Date() });
  }
}

const purchaseDownloadLimitKey = (purchaseId: number) => `digital_purchase_${purchaseId}_download_limit`;
const purchaseDownloadCountKey = (purchaseId: number) => `digital_purchase_${purchaseId}_download_count`;
const purchaseExpiresAtKey = (purchaseId: number) => `digital_purchase_${purchaseId}_expires_at`;

function safeDownloadFileName(value?: string | null) {
  const fileName = (value || "build-level-digital-product").trim();
  return fileName.replace(/[^\w.\- ()]+/g, "_").slice(0, 180) || "build-level-digital-product";
}

async function streamDownload(res: any, url: string, fileName?: string | null) {
  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    throw new Error(`Download source unavailable (${upstream.status})`);
  }

  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) res.setHeader("Content-Length", contentLength);
  res.setHeader("Content-Disposition", `attachment; filename="${safeDownloadFileName(fileName)}"`);
  res.setHeader("Cache-Control", "private, no-store");

  Readable.fromWeb(upstream.body as any).pipe(res);
}

// ─── Products ─────────────────────────────────────────────────────────────────
router.get("/products", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.published, true), eq(products.hidden, false), eq(products.delisted, false)))
      .orderBy(asc(products.sortOrder), asc(products.createdAt));
    const ids = rows.map(row => row.id);
    const variants = ids.length ? await db.select().from(productVariants).where(sql`${productVariants.productId} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`) : [];
    const variantsByProduct = new Map<number, typeof variants>();
    for (const variant of variants) {
      const list = variantsByProduct.get(variant.productId) || [];
      list.push(variant);
      variantsByProduct.set(variant.productId, list);
    }
    res.json(rows.map(row => ({
      ...cleanProductForResponse(row),
      variants: (variantsByProduct.get(row.id) || []).map(variant => ({
        printifyVariantId: variant.printifyVariantId,
        label: variant.label,
        size: variant.size,
        color: variant.color,
        imageUrl: variant.imageUrl,
        available: variant.available,
        enabled: variant.enabled,
      })),
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const db = await getDb();
    const [row] = await db.select().from(products).where(eq(products.id, parseInt(req.params.id))).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(cleanProductForResponse(row));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Blog ─────────────────────────────────────────────────────────────────────
router.get("/blog", async (req, res) => {
  try {
    await publishDueScheduledBlogs();
    const db = await getDb();
    const rows = await db
      .select()
      .from(blogPosts)
      .where(or(eq(blogPosts.published, true), lte(blogPosts.scheduledAt, new Date())))
      .orderBy(asc(blogPosts.sortOrder), asc(blogPosts.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/blog/:slug", async (req, res) => {
  try {
    await publishDueScheduledBlogs();
    const db = await getDb();
    const [row] = await db.select().from(blogPosts).where(and(eq(blogPosts.slug, req.params.slug), or(eq(blogPosts.published, true), lte(blogPosts.scheduledAt, new Date())))).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Private customer order status ────────────────────────────────────────────
async function ensureCustomerOrderStatusTables() {
  const db = await getDb();
  await db.execute(sql.raw(`ALTER TABLE orders ADD COLUMN orderToken VARCHAR(128) NULL UNIQUE`)).catch(() => undefined);
  await db.execute(sql.raw(`ALTER TABLE orders ADD COLUMN customerStatus VARCHAR(128) NULL`)).catch(() => undefined);
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS order_shipments (id INT AUTO_INCREMENT PRIMARY KEY, orderId INT NOT NULL, printifyShipmentId VARCHAR(128) NULL, carrier VARCHAR(128) NULL, trackingNumber VARCHAR(255) NULL, trackingUrl TEXT NULL, status VARCHAR(64) NULL, shippedAt TIMESTAMP NULL, deliveredAt TIMESTAMP NULL, payload JSON NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_order_tracking (orderId, trackingNumber), INDEX idx_order_shipments_order (orderId))`)).catch(() => undefined);
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS order_issues (id INT AUTO_INCREMENT PRIMARY KEY, orderId INT NOT NULL, productId INT NULL, issueType VARCHAR(128) NOT NULL, description TEXT NOT NULL, evidenceUrl TEXT NULL, preferredResolution VARCHAR(128) NULL, status ENUM('reported','admin_review','submitted_to_printify','approved','rejected','closed') NOT NULL DEFAULT 'reported', printifyIssueId VARCHAR(128) NULL, replacementOrderId VARCHAR(128) NULL, refundAmount DECIMAL(10,2) NULL, adminNotes TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_order_issues_order (orderId))`)).catch(() => undefined);
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS order_alerts (id INT AUTO_INCREMENT PRIMARY KEY, orderId INT NOT NULL, alertType VARCHAR(128) NOT NULL, message TEXT NOT NULL, status ENUM('open','resolved') NOT NULL DEFAULT 'open', createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, resolvedAt TIMESTAMP NULL, UNIQUE KEY uq_open_order_alert (orderId, alertType, status), INDEX idx_order_alerts_order (orderId))`)).catch(() => undefined);
}

router.get("/orders/:token/status", async (req, res) => {
  try {
    await ensureCustomerOrderStatusTables();
    const token = String(req.params.token || "").trim();
    if (!token || token.length < 20) { res.status(404).json({ error: "Order not found" }); return; }
    const db = await getDb();
    const [order] = await db.select().from(orders).where(eq(orders.orderToken, token)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    const [items, shipmentResult, issueResult] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
      db.execute(sql`SELECT id, carrier, trackingNumber, trackingUrl, status, shippedAt, deliveredAt, createdAt FROM order_shipments WHERE orderId = ${order.id} ORDER BY createdAt ASC`) as any,
      db.execute(sql`SELECT id, issueType, preferredResolution, status, createdAt, updatedAt FROM order_issues WHERE orderId = ${order.id} ORDER BY createdAt DESC`) as any,
    ]);
    const shipping = order.shippingAddress as any || {};
    res.json({
      order: {
        id: order.id,
        customerStatus: order.customerStatus || order.fulfillmentStatus,
        paymentStatus: order.stripePaymentStatus,
        orderDate: order.createdAt,
        lastUpdated: order.updatedAt,
        orderTotal: order.orderTotal,
        currency: order.currency,
        shippingAddress: { line1: shipping.line1, line2: shipping.line2, city: shipping.city, state: shipping.state, postal_code: shipping.postal_code, country: shipping.country },
      },
      items: items.map(item => ({ id: item.id, productName: item.productName, quantity: item.quantity, selectedSize: item.selectedSize, selectedColor: item.selectedColor, unitPrice: item.unitPrice })),
      shipments: shipmentResult?.[0] || [],
      issues: issueResult?.[0] || [],
    });
  } catch {
    res.status(500).json({ error: "Order status unavailable" });
  }
});

router.post("/orders/:token/issues", async (req, res) => {
  try {
    await ensureCustomerOrderStatusTables();
    const token = String(req.params.token || "").trim();
    const data = z.object({
      productId: z.number().optional().nullable(),
      issueType: z.enum(["Damaged product", "Manufacturing defect", "Wrong product received", "Missing item", "Lost shipment", "Delivery problem", "Wrong size or color ordered", "Other issue"]),
      description: z.string().min(5).max(5000),
      evidenceUrl: z.string().max(2000).optional().default(""),
      preferredResolution: z.string().max(128).optional().default(""),
    }).parse(req.body || {});
    const db = await getDb();
    const [order] = await db.select().from(orders).where(eq(orders.orderToken, token)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    await db.execute(sql`INSERT INTO order_issues (orderId, productId, issueType, description, evidenceUrl, preferredResolution, status) VALUES (${order.id}, ${data.productId || null}, ${data.issueType}, ${data.description}, ${data.evidenceUrl || null}, ${data.preferredResolution || null}, 'reported')`);
    await db.execute(sql`INSERT INTO order_alerts (orderId, alertType, message, status) VALUES (${order.id}, 'customer_reported_issue', ${data.issueType}, 'open') ON DUPLICATE KEY UPDATE message = VALUES(message)`).catch(() => undefined);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Could not submit issue" });
  }
});

// ─── Digital Products ─────────────────────────────────────────────────────────
router.get("/digital", async (req, res) => {
  try {
    await publishDueScheduledDigitalProducts();
    const db = await getDb();
    const rows = await db
      .select()
      .from(digitalProducts)
      .where(or(eq(digitalProducts.published, true), sql`${digitalProducts.scheduledAt} > NOW()`))
      .orderBy(asc(digitalProducts.sortOrder), asc(digitalProducts.createdAt));
    res.json(rows.map(cleanDigitalProductForResponse));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/digital/thumbnail/:key", async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key || "");
    if (!key.startsWith("thumbnail/")) {
      res.status(400).json({ error: "Invalid thumbnail key" });
      return;
    }
    const url = await getProtectedDownloadUrl(key);
    res.redirect(302, url);
  } catch (e: any) {
    res.status(404).json({ error: e.message || "Thumbnail not found" });
  }
});

router.get("/digital/download/:token", async (req, res) => {
  try {
    const db = await getDb();
    const [purchase] = await db
      .select()
      .from(digitalPurchases)
      .where(eq(digitalPurchases.downloadToken, req.params.token))
      .limit(1);

    if (!purchase) { res.status(404).json({ error: "Download not found" }); return; }

    const [product] = await db
      .select()
      .from(digitalProducts)
      .where(eq(digitalProducts.id, purchase.productId))
      .limit(1);

    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const settings = await getSettingsMap([
      purchaseDownloadLimitKey(purchase.id),
      purchaseDownloadCountKey(purchase.id),
      purchaseExpiresAtKey(purchase.id),
    ]);
    const limit = Number.parseInt(settings[purchaseDownloadLimitKey(purchase.id)] || "1", 10);
    const count = Math.max(0, Number.parseInt(settings[purchaseDownloadCountKey(purchase.id)] || "0", 10) || 0);
    const expiresAt = settings[purchaseExpiresAtKey(purchase.id)];
    if (expiresAt && Date.now() > Date.parse(expiresAt)) {
      res.status(410).json({ error: "This download link has expired" });
      return;
    }
    if (count >= limit) {
      res.status(403).json({ error: "Download limit reached" });
      return;
    }

    let url = product.fileUrl || "";
    if (product.fileKey) url = await getProtectedDownloadUrl(product.fileKey);
    if (!url) { res.status(404).json({ error: "No downloadable file configured" }); return; }

    await streamDownload(res, url, product.fileName || product.name);
    await db.update(digitalPurchases).set({ downloadedAt: new Date() }).where(eq(digitalPurchases.id, purchase.id));
    await saveSetting(purchaseDownloadCountKey(purchase.id), String(count + 1));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/social-links", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(siteSettings);
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value ?? "";
    const links = SOCIAL_PLATFORMS
      .map((platform) => ({
        platform,
        handle: settings[`social_${platform}_handle`] || "",
        url: settings[`social_${platform}_url`] || "",
        enabled: settings[`social_${platform}_enabled`] === "true",
      }))
      .filter((link) => link.enabled && link.url && isValidHttpUrl(link.url));
    res.json({ email: BUSINESS_EMAIL, links });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/maintenance", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(siteSettings);
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value ?? "";
    res.json({
      enabled: settings.maintenance_enabled === "true",
      title: settings.maintenance_title || DEFAULT_MAINTENANCE.title,
      message: settings.maintenance_message || DEFAULT_MAINTENANCE.message,
      returnText: settings.maintenance_return_text || DEFAULT_MAINTENANCE.returnText,
      contactEmail: settings.maintenance_contact_email || settings.contact_email || DEFAULT_MAINTENANCE.contactEmail,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/tidio/config", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(siteSettings);
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value ?? "";
    const publicKey = normalizeTidioPublicKey(settingOrEnv(settings, "tidio_public_key", process.env.TIDIO_PUBLIC_KEY));
    const disabled = settings.tidio_disabled === "true";
    res.json({
      enabled: !disabled && settings.tidio_enabled === "true" && !!publicKey,
      publicKey: disabled ? "" : publicKey,
      chatControls: settings.tidio_chat_controls || "manual",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/contact", async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(120),
      email: z.string().email().max(320),
      message: z.string().min(5).max(5000),
    });
    const data = schema.parse(req.body);

    await sendBusinessEmail({
      subject: `Build Level contact: ${data.name}`,
      replyTo: data.email,
      text: `Name: ${data.name}\nEmail: ${data.email}\n\n${data.message}`,
      html: `<p><strong>Name:</strong> ${data.name}</p><p><strong>Email:</strong> ${data.email}</p><p>${data.message.replace(/\n/g, "<br />")}</p>`,
    });

    await sendCustomerEmail({
      to: data.email,
      subject: "We received your Build Level message",
      text: `Thanks ${data.name},\n\nWe received your message and will reply from ${BUSINESS_EMAIL} soon.\n\nDiscipline. Focus. Execution.\nBUILD LEVEL`,
      html: `<p>Thanks ${data.name},</p><p>We received your message and will reply from <a href="mailto:${BUSINESS_EMAIL}">${BUSINESS_EMAIL}</a> soon.</p><p>Discipline. Focus. Execution.<br />BUILD LEVEL</p>`,
    }).catch(() => undefined);

    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({
      success: false,
      error: isEmailConfigured() ? e.message : "Email delivery is not configured",
    });
  }
});

// ─── Affiliate Products ───────────────────────────────────────────────────────
router.get("/affiliate", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(affiliateProducts)
      .where(eq(affiliateProducts.published, true))
      .orderBy(asc(affiliateProducts.sortOrder), asc(affiliateProducts.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Membership Tiers ─────────────────────────────────────────────────────────
router.get("/memberships", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(membershipTiers)
      .where(eq(membershipTiers.published, true))
      .orderBy(asc(membershipTiers.sortOrder), asc(membershipTiers.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── AI Chat (Public) ─────────────────────────────────────────────────────────
router.get("/chat/config", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(siteSettings);
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value ?? '';
    res.json({
      enabled: map['ai_chat_enabled'] === 'true',
      greeting: map['ai_chat_greeting'] || 'Hey! Welcome to Build Level. How can I help you today?',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/chat/message", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) { res.status(400).json({ error: 'Message required' }); return; }
    const db = await getDb();
    const rows = await db.select().from(siteSettings);
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value ?? '';
    
    if (map['ai_chat_enabled'] !== 'true') {
      res.json({ reply: 'Chat is currently unavailable. Please contact us via email.' });
      return;
    }
    
    const persona = map['ai_chat_persona'] || 'You are a helpful customer service assistant for Build Level, a premium streetwear brand. Be friendly, concise, and helpful. Keep responses under 3 sentences.';
    
    // Use the built-in LLM if available, otherwise return a fallback
    const forgeUrl = process.env.BUILT_IN_FORGE_API_URL;
    const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;
    
    if (!forgeUrl || !forgeKey) {
      res.json({ reply: 'Thanks for reaching out! Our team will get back to you soon. For immediate help, email us at info@buildlevel.com' });
      return;
    }
    
    const messages = [
      { role: 'system', content: persona },
      ...(Array.isArray(history) ? history.slice(-6) : []),
      { role: 'user', content: message },
    ];
    
    const llmRes = await fetch(`${forgeUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${forgeKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 200 }),
    });
    
    const llmData = await llmRes.json() as { choices?: { message?: { content?: string } }[] };
    const reply = llmData.choices?.[0]?.message?.content || 'Thanks for your message! We will get back to you soon.';
    res.json({ reply });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
