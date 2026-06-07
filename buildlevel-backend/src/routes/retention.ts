import { Router, Request } from "express";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { blogPosts, digitalProducts, productVariants, products, siteSettings } from "../db/schema.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { BUSINESS_EMAIL, isEmailConfigured, sendCustomerEmail } from "../services/email.js";

const router = Router();
const CART_TTL_DAYS = 30;
const RECOVERY_TOKEN_HOURS = 72;
const SUBSCRIPTION_INTERESTS = [
  "new_apparel",
  "digital_products",
  "audiobooks",
  "featured_products",
  "blog_motivation",
  "build_level_news",
  "all_updates",
] as const;

let tablesEnsured = false;
const subscriptionRateLimit = new Map<string, number[]>();

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase().slice(0, 320);
}

function getClientIp(req: Request) {
  return String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function addHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function toMoney(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function ensureRetentionTables() {
  if (tablesEnsured) return;
  const db = await getDb();
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS carts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sessionId VARCHAR(128) NOT NULL UNIQUE,
      customerEmail VARCHAR(320) NULL,
      customerFirstName VARCHAR(160) NULL,
      status ENUM('active','abandoned','converted','recovered','resolved','expired','disabled') NOT NULL DEFAULT 'active',
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      itemCount INT NOT NULL DEFAULT 0,
      recoveryTokenHash VARCHAR(128) NULL,
      recoveryExpiresAt TIMESTAMP NULL,
      reminderCount INT NOT NULL DEFAULT 0,
      remindersDisabled BOOLEAN NOT NULL DEFAULT false,
      completedOrderId VARCHAR(128) NULL,
      lastActivityAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_carts_email (customerEmail),
      INDEX idx_carts_status (status),
      INDEX idx_carts_last_activity (lastActivityAt)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cartId INT NOT NULL,
      productType ENUM('apparel','digital') NOT NULL,
      productId INT NOT NULL,
      productName VARCHAR(255) NOT NULL,
      imageUrl TEXT NULL,
      selectedSize VARCHAR(255) NULL,
      selectedColor VARCHAR(128) NULL,
      selectedVariant VARCHAR(255) NULL,
      printifyProductId VARCHAR(128) NULL,
      printifyVariantId VARCHAR(128) NULL,
      quantity INT NOT NULL DEFAULT 1,
      unitPrice DECIMAL(10,2) NOT NULL,
      itemTotal DECIMAL(10,2) NOT NULL,
      validationStatus ENUM('valid','requires_review','unavailable') NOT NULL DEFAULT 'valid',
      validationMessage TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cart_item_variant (cartId, productType, productId, selectedVariant),
      INDEX idx_cart_items_cart (cartId),
      INDEX idx_cart_items_product (productType, productId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS abandoned_carts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cartId INT NOT NULL UNIQUE,
      customerEmail VARCHAR(320) NOT NULL,
      status ENUM('eligible','paused','recovered','resolved','expired','unsubscribed','blocked') NOT NULL DEFAULT 'eligible',
      reminderStage VARCHAR(32) NOT NULL DEFAULT 'none',
      reminderCount INT NOT NULL DEFAULT 0,
      recoveredAt TIMESTAMP NULL,
      completedOrderId VARCHAR(128) NULL,
      couponEnabled BOOLEAN NOT NULL DEFAULT false,
      lastReminderAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_abandoned_email (customerEmail),
      INDEX idx_abandoned_status (status)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS cart_recovery_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cartId INT NOT NULL,
      tokenHash VARCHAR(128) NOT NULL UNIQUE,
      status ENUM('active','used','expired','revoked') NOT NULL DEFAULT 'active',
      expiresAt TIMESTAMP NOT NULL,
      usedAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_recovery_cart (cartId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS cart_reminders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cartId INT NOT NULL,
      stage VARCHAR(32) NOT NULL,
      status ENUM('scheduled','sent','failed','skipped','cancelled') NOT NULL DEFAULT 'scheduled',
      subject VARCHAR(255) NULL,
      sentAt TIMESTAMP NULL,
      errorMessage TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cart_reminder_stage (cartId, stage),
      INDEX idx_cart_reminders_cart (cartId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(320) NOT NULL UNIQUE,
      firstName VARCHAR(160) NULL,
      status ENUM('active','unsubscribed','blocked') NOT NULL DEFAULT 'active',
      subscriptionSource VARCHAR(128) NULL,
      consentStatus ENUM('subscribed','unsubscribed','blocked') NOT NULL DEFAULT 'subscribed',
      consentIp VARCHAR(128) NULL,
      consentHistory JSON NULL,
      manageTokenHash VARCHAR(128) NULL,
      lastCampaignAt TIMESTAMP NULL,
      subscribedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      unsubscribedAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_subscribers_status (status),
      INDEX idx_subscribers_source (subscriptionSource)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS subscriber_preferences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      subscriberId INT NOT NULL,
      interest VARCHAR(64) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_subscriber_interest (subscriberId, interest),
      INDEX idx_subscriber_preferences_interest (interest)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS email_campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      campaignType ENUM('abandoned_cart','newsletter','product_announcement','test') NOT NULL DEFAULT 'newsletter',
      subject VARCHAR(255) NOT NULL,
      bodyHtml MEDIUMTEXT NULL,
      audience JSON NULL,
      status ENUM('draft','scheduled','sent','cancelled','failed') NOT NULL DEFAULT 'draft',
      scheduledAt TIMESTAMP NULL,
      sentAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS email_campaign_recipients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      campaignId INT NOT NULL,
      subscriberId INT NULL,
      email VARCHAR(320) NOT NULL,
      status ENUM('queued','sent','delivered','failed','unsubscribed','skipped') NOT NULL DEFAULT 'queued',
      sentAt TIMESTAMP NULL,
      errorMessage TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_campaign_recipient (campaignId, email),
      INDEX idx_campaign_recipients_campaign (campaignId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS email_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      eventType VARCHAR(64) NOT NULL,
      email VARCHAR(320) NULL,
      cartId INT NULL,
      campaignId INT NULL,
      subscriberId INT NULL,
      metadata JSON NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_events_email (email),
      INDEX idx_email_events_cart (cartId),
      INDEX idx_email_events_campaign (campaignId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS monthly_digest_queue (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contentType ENUM('apparel','digital','audiobook','featured','blog','news','announcement') NOT NULL,
      contentId INT NULL,
      title VARCHAR(255) NOT NULL,
      imageUrl TEXT NULL,
      url TEXT NULL,
      summary TEXT NULL,
      included BOOLEAN NOT NULL DEFAULT true,
      sortOrder INT NOT NULL DEFAULT 0,
      includedInCampaignId INT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_monthly_digest_content (contentType, contentId),
      INDEX idx_monthly_digest_included (included)
    )
  `));
  tablesEnsured = true;
}

const cartItemSchema = z.object({
  productType: z.enum(["apparel", "digital"]),
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(99).default(1),
  selectedSize: z.string().optional().default(""),
  selectedColor: z.string().optional().default(""),
  selectedVariant: z.string().optional().default(""),
  printifyVariantId: z.string().optional().default(""),
});

async function validateCartItem(raw: z.infer<typeof cartItemSchema>) {
  const db = await getDb();
  const quantity = Math.max(1, Math.min(99, raw.quantity));
  const selectedVariant = cleanText(raw.selectedVariant || raw.printifyVariantId || raw.selectedSize, 255);
  if (raw.productType === "digital") {
    const [product] = await db.select().from(digitalProducts).where(eq(digitalProducts.id, raw.productId)).limit(1);
    if (!product || !product.published) throw new Error(`Digital product ${raw.productId} is not available`);
    const unitPrice = toMoney(product.price);
    return {
      productType: "digital" as const,
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl || "",
      selectedSize: "",
      selectedColor: "",
      selectedVariant: selectedVariant || String(product.id),
      printifyProductId: "",
      printifyVariantId: "",
      quantity,
      unitPrice,
      itemTotal: unitPrice * quantity,
      validationStatus: "valid",
      validationMessage: "",
    };
  }

  const [product] = await db.select().from(products).where(eq(products.id, raw.productId)).limit(1);
  if (!product || !product.published || product.hidden || product.delisted || !product.inStock) {
    throw new Error(`Apparel product ${raw.productId} is not available`);
  }
  if (!product.printifyProductId) throw new Error(`${product.name} is missing Printify product mapping`);

  const variantId = cleanText(raw.printifyVariantId || raw.selectedVariant, 128);
  let unitPrice = toMoney(product.price);
  let variantLabel = cleanText(raw.selectedSize || raw.selectedVariant, 255);
  if (variantId) {
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.printifyVariantId, variantId)).limit(1);
    if (!variant || !variant.enabled || !variant.available) throw new Error(`${product.name} selected variant is unavailable`);
    unitPrice = toMoney(variant.price);
    variantLabel = variant.label || variantLabel || variantId;
  }

  return {
    productType: "apparel" as const,
    productId: product.id,
    productName: product.name,
    imageUrl: product.imageUrl || "",
    selectedSize: cleanText(raw.selectedSize || variantLabel, 255),
    selectedColor: cleanText(raw.selectedColor, 128),
    selectedVariant: variantLabel || variantId || String(product.id),
    printifyProductId: product.printifyProductId || "",
    printifyVariantId: variantId,
    quantity,
    unitPrice,
    itemTotal: unitPrice * quantity,
    validationStatus: "valid",
    validationMessage: "",
  };
}

async function getCartBySession(sessionId: string) {
  const db = await getDb();
  const [rows] = await db.execute(sql`SELECT * FROM carts WHERE sessionId = ${sessionId} LIMIT 1`) as any;
  return rows?.[0] || null;
}

async function getCartWithItemsById(cartId: number) {
  const db = await getDb();
  const [cartRows] = await db.execute(sql`SELECT * FROM carts WHERE id = ${cartId} LIMIT 1`) as any;
  const [itemRows] = await db.execute(sql`SELECT * FROM cart_items WHERE cartId = ${cartId} ORDER BY productType, id`) as any;
  return { cart: cartRows?.[0] || null, items: itemRows || [] };
}

async function createRecoveryToken(cartId: number) {
  const db = await getDb();
  const token = randomToken();
  const tokenHash = hashToken(token);
  const expiresAt = addHours(RECOVERY_TOKEN_HOURS);
  await db.execute(sql`INSERT INTO cart_recovery_tokens (cartId, tokenHash, expiresAt) VALUES (${cartId}, ${tokenHash}, ${expiresAt})`);
  await db.execute(sql`UPDATE carts SET recoveryTokenHash = ${tokenHash}, recoveryExpiresAt = ${expiresAt}, updatedAt = NOW() WHERE id = ${cartId}`);
  return token;
}

function sanitizeCartResponse(cart: any, items: any[], recoveryToken?: string) {
  return {
    id: cart?.id,
    sessionId: cart?.sessionId,
    customerEmail: cart?.customerEmail || "",
    customerFirstName: cart?.customerFirstName || "",
    status: cart?.status || "active",
    subtotal: Number(cart?.subtotal || 0),
    itemCount: Number(cart?.itemCount || 0),
    lastActivityAt: cart?.lastActivityAt,
    expiresAt: cart?.expiresAt,
    recoveryUrl: recoveryToken ? `/cart/recover/${recoveryToken}` : undefined,
    items: items.map((item: any) => ({
      productType: item.productType,
      productId: Number(item.productId),
      productName: item.productName,
      imageUrl: item.imageUrl,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
      selectedVariant: item.selectedVariant,
      printifyVariantId: item.printifyVariantId,
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.unitPrice || 0),
      itemTotal: Number(item.itemTotal || 0),
      validationStatus: item.validationStatus,
      validationMessage: item.validationMessage,
    })),
  };
}

async function saveCartEvent(eventType: string, metadata: Record<string, unknown>, email?: string, cartId?: number) {
  const db = await getDb();
  await db.execute(sql`INSERT INTO email_events (eventType, email, cartId, metadata) VALUES (${eventType}, ${email || null}, ${cartId || null}, ${metadata as any})`).catch(() => undefined);
}

async function getOrCreateManageToken(email: string) {
  const token = randomToken();
  const tokenHash = hashToken(token);
  const db = await getDb();
  await db.execute(sql`UPDATE subscribers SET manageTokenHash = ${tokenHash}, updatedAt = NOW() WHERE email = ${email}`);
  return token;
}

function getFrontendOrigin(req: Request) {
  const origin = String(req.headers.origin || process.env.FRONTEND_URL || process.env.PUBLIC_FRONTEND_URL || "https://thebuildlevel.com");
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "https://thebuildlevel.com";
  }
}

async function getRetentionSettings() {
  const db = await getDb();
  const rows = await db.select().from(siteSettings);
  const settings = Object.fromEntries(rows.map(row => [row.key, row.value ?? ""]));
  return {
    recoveryEnabled: settings.cart_recovery_enabled === "true",
    firstReminderHours: Number(settings.cart_recovery_first_hours || 1),
    secondReminderHours: Number(settings.cart_recovery_second_hours || 24),
    finalReminderHours: Number(settings.cart_recovery_final_hours || 72),
    abandonedAfterMinutes: Number(settings.cart_abandoned_after_minutes || 60),
    reminderSubject: settings.cart_recovery_subject || "You left something behind at Build Level",
    reminderIntro: settings.cart_recovery_intro || "You left something in your Build Level cart. Your selections are still waiting when you're ready to continue.",
  };
}

async function markInactiveCartsAbandoned() {
  const settings = await getRetentionSettings();
  const db = await getDb();
  if (!settings.recoveryEnabled) return;
  await db.execute(sql`
    UPDATE carts
    SET status = 'abandoned', updatedAt = NOW()
    WHERE status = 'active'
      AND itemCount > 0
      AND customerEmail IS NOT NULL
      AND remindersDisabled = false
      AND lastActivityAt < DATE_SUB(NOW(), INTERVAL ${settings.abandonedAfterMinutes} MINUTE)
  `);
  await db.execute(sql`
    INSERT INTO abandoned_carts (cartId, customerEmail, status)
    SELECT id, customerEmail, 'eligible'
    FROM carts
    WHERE status = 'abandoned' AND customerEmail IS NOT NULL
    ON DUPLICATE KEY UPDATE customerEmail = VALUES(customerEmail), updatedAt = NOW()
  `);
  await db.execute(sql`UPDATE abandoned_carts SET status = 'eligible', updatedAt = NOW() WHERE status NOT IN ('recovered','resolved','expired','unsubscribed','blocked')`);
}

async function getMonthlyDigestSettings() {
  const db = await getDb();
  const rows = await db.select().from(siteSettings);
  const settings = Object.fromEntries(rows.map(row => [row.key, row.value ?? ""]));
  return {
    enabled: settings.monthly_digest_enabled !== "false",
    dayOfMonth: Number(settings.monthly_digest_day_of_month || 1),
    dayName: settings.monthly_digest_day_name || "first_monday",
    time: settings.monthly_digest_time || "10:00",
    timezone: settings.monthly_digest_timezone || "America/New_York",
    subject: settings.monthly_digest_subject || "Build Level Monthly — New Drops, Digital Guides & Updates",
    introduction: settings.monthly_digest_intro || "One focused update. New releases, selected resources, and what's happening at Build Level.",
    status: settings.monthly_digest_status || "draft",
  };
}

async function upsertDigestSetting(key: string, value: string) {
  const db = await getDb();
  await db.execute(sql`INSERT INTO site_settings (\`key\`, value, updatedAt) VALUES (${key}, ${value}, NOW()) ON DUPLICATE KEY UPDATE value = VALUES(value), updatedAt = NOW()`);
}

function normalizeDigestAudience(audience?: string[]) {
  const clean = (Array.isArray(audience) && audience.length ? audience : ["all_updates"]).filter(Boolean);
  return clean.includes("all_updates") ? ["all_updates"] : Array.from(new Set(clean));
}

function digestContentTypesForAudience(audience?: string[]) {
  const interests = normalizeDigestAudience(audience);
  if (interests.includes("all_updates")) return ["apparel", "featured", "digital", "audiobook", "blog", "news", "announcement"];
  const types = new Set<string>();
  if (interests.includes("new_apparel")) types.add("apparel");
  if (interests.includes("featured_products")) types.add("featured");
  if (interests.includes("digital_products")) types.add("digital");
  if (interests.includes("audiobooks")) types.add("audiobook");
  if (interests.includes("blog_motivation")) types.add("blog");
  if (interests.includes("build_level_news")) { types.add("news"); types.add("announcement"); }
  return Array.from(types);
}

function rowMatchesAudience(row: any, audience?: string[]) {
  const types = digestContentTypesForAudience(audience);
  return types.length === 0 ? false : types.includes(String(row.contentType));
}

async function refreshMonthlyDigestQueue(audience?: string[], currentMonthOnly = false) {
  const db = await getDb();
  const allowedTypes = digestContentTypesForAudience(audience);
  if (currentMonthOnly) {
    if (allowedTypes.length === 0) await db.execute(sql`DELETE FROM monthly_digest_queue WHERE createdAt >= DATE_FORMAT(NOW(), '%Y-%m-01')`);
    else await db.execute(sql`DELETE FROM monthly_digest_queue WHERE contentType IN (${sql.join(allowedTypes.map(type => sql`${type}`), sql`, `)})`);
  }
  const [apparelRows, digitalRows, blogRows] = await Promise.all([
    allowedTypes.some(type => type === "apparel" || type === "featured")
      ? db.select().from(products).where(eq(products.published, true)).limit(20)
      : Promise.resolve([]),
    allowedTypes.some(type => type === "digital" || type === "audiobook")
      ? db.select().from(digitalProducts).where(eq(digitalProducts.published, true)).limit(20)
      : Promise.resolve([]),
    allowedTypes.includes("blog")
      ? db.select().from(blogPosts).where(eq(blogPosts.published, true)).limit(20)
      : Promise.resolve([]),
  ]);
  const isThisMonth = (value?: Date | string | null) => {
    if (!currentMonthOnly) return true;
    const date = value ? new Date(value) : new Date();
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  };
  for (const product of apparelRows.filter(product => !product.hidden && !product.delisted && product.inStock && isThisMonth(product.createdAt))) {
    const type = product.featured ? "featured" : "apparel";
    if (!allowedTypes.includes(type)) continue;
    await db.execute(sql`INSERT INTO monthly_digest_queue (contentType, contentId, title, imageUrl, url, summary, included, sortOrder) VALUES (${type}, ${product.id}, ${product.name}, ${product.imageUrl || ""}, ${`/shop`}, ${product.description || ""}, true, 0) ON DUPLICATE KEY UPDATE title = VALUES(title), imageUrl = VALUES(imageUrl), url = VALUES(url), summary = VALUES(summary), updatedAt = NOW()`);
  }
  for (const product of digitalRows.filter(product => isThisMonth(product.createdAt))) {
    const type = product.productType === "audiobook" ? "audiobook" : "digital";
    if (!allowedTypes.includes(type)) continue;
    await db.execute(sql`INSERT INTO monthly_digest_queue (contentType, contentId, title, imageUrl, url, summary, included, sortOrder) VALUES (${type}, ${product.id}, ${product.name}, ${product.imageUrl || ""}, ${`/digital/${product.id}`}, ${product.description || ""}, true, 0) ON DUPLICATE KEY UPDATE title = VALUES(title), imageUrl = VALUES(imageUrl), url = VALUES(url), summary = VALUES(summary), updatedAt = NOW()`);
  }
  for (const post of blogRows.filter(post => isThisMonth(post.createdAt))) {
    await db.execute(sql`INSERT INTO monthly_digest_queue (contentType, contentId, title, imageUrl, url, summary, included, sortOrder) VALUES ('blog', ${post.id}, ${post.title}, ${post.imageUrl || ""}, ${`/blog/${post.slug}`}, ${post.excerpt || ""}, true, 0) ON DUPLICATE KEY UPDATE title = VALUES(title), imageUrl = VALUES(imageUrl), url = VALUES(url), summary = VALUES(summary), updatedAt = NOW()`);
  }
}

async function getDigestQueueRows(audience?: string[], currentMonthOnly = false) {
  const db = await getDb();
  const [rows] = currentMonthOnly
    ? await db.execute(sql`SELECT * FROM monthly_digest_queue WHERE createdAt >= DATE_FORMAT(NOW(), '%Y-%m-01') ORDER BY included DESC, sortOrder ASC, createdAt DESC LIMIT 100`) as any
    : await db.execute(sql`SELECT * FROM monthly_digest_queue ORDER BY included DESC, sortOrder ASC, createdAt DESC LIMIT 100`) as any;
  return (rows || []).filter(row => rowMatchesAudience(row, audience));
}

async function getEligibleSubscriberRows(audience?: string[]) {
  const db = await getDb();
  const interests = normalizeDigestAudience(audience);
  const includeAllUpdates = interests.includes("all_updates");
  const [rows] = await db.execute(sql`
    SELECT DISTINCT s.*
    FROM subscribers s
    LEFT JOIN subscriber_preferences p ON p.subscriberId = s.id
    WHERE s.status = 'active'
      AND s.consentStatus = 'subscribed'
      AND ${includeAllUpdates ? sql`p.interest = 'all_updates'` : sql`p.interest IN (${sql.join(interests.map(interest => sql`${interest}`), sql`, `)})`}
  `) as any;
  return rows || [];
}

function buildMonthlyDigestHtml(settings: Awaited<ReturnType<typeof getMonthlyDigestSettings>>, queueRows: any[], origin = "https://thebuildlevel.com") {
  const selected = queueRows.filter(row => row.included).slice(0, 7);
  const itemsHtml = selected.map(row => `
    <tr>
      <td style="padding:18px 0;border-top:1px solid #2a2a2a">
        ${row.imageUrl ? `<img src="${String(row.imageUrl).startsWith("http") ? row.imageUrl : origin + row.imageUrl}" alt="" style="width:100%;max-width:520px;border-radius:10px;background:#111" />` : ""}
        <h3 style="color:#fff;font-family:Arial,sans-serif;margin:14px 0 8px;text-transform:uppercase">${row.title}</h3>
        <p style="color:#aaa;line-height:1.6">${row.summary || ""}</p>
        <a href="${origin}${row.url || "/"}" style="display:inline-block;background:#c0392b;color:#fff;padding:11px 16px;text-decoration:none;text-transform:uppercase;border-radius:4px">View ${row.contentType === "blog" ? "Blog" : "Product"}</a>
      </td>
    </tr>
  `).join("");
  return `<div style="background:#0a0a0a;color:#f0ede8;padding:28px;font-family:Arial,sans-serif"><table role="presentation" width="100%" style="max-width:640px;margin:0 auto"><tr><td><p style="color:#ff6600;letter-spacing:2px;text-transform:uppercase">THE MONTHLY BUILD</p><h1 style="color:#fff;text-transform:uppercase">Build Level Monthly</h1><p style="color:#bbb;line-height:1.7">${settings.introduction}</p></td></tr>${itemsHtml}<tr><td style="padding-top:22px;color:#888;font-size:12px">BUILD LEVEL • Discipline • Focus • Execution<br/>Manage preferences or unsubscribe from the link in your email. Support: ${BUSINESS_EMAIL}</td></tr></table></div>`;
}

router.post("/cart/sync", async (req, res) => {
  try {
    await ensureRetentionTables();
    const schema = z.object({
      sessionId: z.string().min(8).max(128),
      customerEmail: z.string().email().optional().or(z.literal("")),
      customerFirstName: z.string().max(160).optional().default(""),
      items: z.array(cartItemSchema).max(30),
    });
    const data = schema.parse(req.body);
    const db = await getDb();
    const email = cleanEmail(data.customerEmail);
    const firstName = cleanText(data.customerFirstName, 160);
    const validated = [];
    for (const item of data.items) validated.push(await validateCartItem(item));
    const subtotal = validated.reduce((sum, item) => sum + item.itemTotal, 0);
    const itemCount = validated.reduce((sum, item) => sum + item.quantity, 0);
    const status = itemCount === 0 ? "resolved" : "active";
    const expiresAt = addDays(CART_TTL_DAYS);

    await db.execute(sql`
      INSERT INTO carts (sessionId, customerEmail, customerFirstName, status, subtotal, itemCount, lastActivityAt, expiresAt)
      VALUES (${data.sessionId}, ${email || null}, ${firstName || null}, ${status}, ${subtotal.toFixed(2)}, ${itemCount}, NOW(), ${expiresAt})
      ON DUPLICATE KEY UPDATE customerEmail = COALESCE(VALUES(customerEmail), customerEmail), customerFirstName = COALESCE(VALUES(customerFirstName), customerFirstName), status = VALUES(status), subtotal = VALUES(subtotal), itemCount = VALUES(itemCount), lastActivityAt = NOW(), expiresAt = VALUES(expiresAt), updatedAt = NOW()
    `);
    const cart = await getCartBySession(data.sessionId);
    await db.execute(sql`DELETE FROM cart_items WHERE cartId = ${cart.id}`);
    for (const item of validated) {
      await db.execute(sql`
        INSERT INTO cart_items (cartId, productType, productId, productName, imageUrl, selectedSize, selectedColor, selectedVariant, printifyProductId, printifyVariantId, quantity, unitPrice, itemTotal, validationStatus, validationMessage)
        VALUES (${cart.id}, ${item.productType}, ${item.productId}, ${item.productName}, ${item.imageUrl}, ${item.selectedSize}, ${item.selectedColor}, ${item.selectedVariant}, ${item.printifyProductId}, ${item.printifyVariantId}, ${item.quantity}, ${item.unitPrice.toFixed(2)}, ${item.itemTotal.toFixed(2)}, ${item.validationStatus}, ${item.validationMessage})
      `);
    }
    let recoveryToken = "";
    const settings = await getRetentionSettings();
    if (email && itemCount > 0 && settings.recoveryEnabled) {
      recoveryToken = await createRecoveryToken(cart.id);
      await db.execute(sql`
        INSERT INTO abandoned_carts (cartId, customerEmail, status)
        VALUES (${cart.id}, ${email}, 'eligible')
        ON DUPLICATE KEY UPDATE customerEmail = VALUES(customerEmail), updatedAt = NOW()
      `);
      await db.execute(sql`UPDATE abandoned_carts SET status = 'eligible', updatedAt = NOW() WHERE cartId = ${cart.id} AND status NOT IN ('recovered','resolved','expired','unsubscribed','blocked')`);
    } else if (itemCount === 0) {
      await db.execute(sql`UPDATE abandoned_carts SET status = 'resolved', updatedAt = NOW() WHERE cartId = ${cart.id} AND status IN ('eligible','paused')`);
      await db.execute(sql`UPDATE cart_reminders SET status = 'cancelled' WHERE cartId = ${cart.id} AND status = 'scheduled'`);
    }
    const saved = await getCartWithItemsById(cart.id);
    res.json({ success: true, cart: sanitizeCartResponse(saved.cart, saved.items, recoveryToken || undefined) });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/cart/converted", async (req, res) => {
  try {
    await ensureRetentionTables();
    const schema = z.object({ sessionId: z.string().min(8).max(128), completedOrderId: z.string().max(128).optional().default("") });
    const data = schema.parse(req.body);
    const db = await getDb();
    const cart = await getCartBySession(data.sessionId);
    if (cart) {
      await db.execute(sql`UPDATE carts SET status = 'converted', completedOrderId = ${data.completedOrderId || null}, remindersDisabled = true, updatedAt = NOW() WHERE id = ${cart.id}`);
      await db.execute(sql`UPDATE abandoned_carts SET status = 'recovered', recoveredAt = NOW(), completedOrderId = ${data.completedOrderId || null}, updatedAt = NOW() WHERE cartId = ${cart.id}`);
      await db.execute(sql`UPDATE cart_reminders SET status = 'cancelled' WHERE cartId = ${cart.id} AND status = 'scheduled'`);
      await saveCartEvent("cart_converted", { completedOrderId: data.completedOrderId || "" }, cart.customerEmail, cart.id);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/cart/recover/:token", async (req, res) => {
  try {
    await ensureRetentionTables();
    const tokenHash = hashToken(String(req.params.token || ""));
    const db = await getDb();
    const [tokenRows] = await db.execute(sql`SELECT * FROM cart_recovery_tokens WHERE tokenHash = ${tokenHash} AND status = 'active' AND expiresAt > NOW() LIMIT 1`) as any;
    const tokenRow = tokenRows?.[0];
    if (!tokenRow) { res.status(404).json({ error: "Recovery link is expired or invalid" }); return; }
    const saved = await getCartWithItemsById(tokenRow.cartId);
    if (!saved.cart || saved.cart.status === "converted") { res.status(404).json({ error: "Cart is no longer available" }); return; }
    await db.execute(sql`UPDATE cart_recovery_tokens SET status = 'used', usedAt = NOW() WHERE id = ${tokenRow.id}`);
    await saveCartEvent("cart_recovery_opened", {}, saved.cart.customerEmail, saved.cart.id);
    res.json({ success: true, cart: sanitizeCartResponse(saved.cart, saved.items) });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/subscribe", async (req, res) => {
  try {
    await ensureRetentionTables();
    const now = Date.now();
    const ip = getClientIp(req) || "unknown";
    const recent = (subscriptionRateLimit.get(ip) || []).filter(timestamp => now - timestamp < 60_000);
    if (recent.length >= 5) { res.status(429).json({ error: "Please wait before subscribing again" }); return; }
    recent.push(now);
    subscriptionRateLimit.set(ip, recent);

    const schema = z.object({
      email: z.string().email().max(320),
      firstName: z.string().max(160).optional().default(""),
      interests: z.array(z.enum(SUBSCRIPTION_INTERESTS)).min(1).default(["all_updates"]),
      source: z.string().max(128).optional().default("website"),
      consent: z.boolean().refine(Boolean, "Consent is required"),
      resubscribe: z.boolean().optional().default(false),
    });
    const data = schema.parse(req.body);
    const db = await getDb();
    const email = cleanEmail(data.email);
    const firstName = cleanText(data.firstName, 160);
    const token = randomToken();
    const tokenHash = hashToken(token);
    const [existingRows] = await db.execute(sql`SELECT id, status FROM subscribers WHERE email = ${email} LIMIT 1`) as any;
    const existing = existingRows?.[0];
    if (existing?.status === "active") {
      await db.execute(sql`UPDATE subscribers SET manageTokenHash = ${tokenHash}, updatedAt = NOW() WHERE id = ${existing.id}`);
      res.json({ success: true, status: "existing", message: "This email is already subscribed. You can update your preferences.", manageUrl: `/email/preferences/${token}` });
      return;
    }
    if (existing?.status === "unsubscribed" && !data.resubscribe) {
      await db.execute(sql`UPDATE subscribers SET manageTokenHash = ${tokenHash}, updatedAt = NOW() WHERE id = ${existing.id}`);
      res.status(409).json({ success: false, status: "unsubscribed", error: "This email was previously unsubscribed. Confirm resubscription to receive the monthly Build Level email.", manageUrl: `/email/preferences/${token}` });
      return;
    }
    await db.execute(sql`
      INSERT INTO subscribers (email, firstName, status, subscriptionSource, consentStatus, consentIp, consentHistory, manageTokenHash, subscribedAt)
      VALUES (${email}, ${firstName || null}, 'active', ${cleanText(data.source, 128)}, 'subscribed', ${ip}, NULL, ${tokenHash}, NOW())
      ON DUPLICATE KEY UPDATE firstName = COALESCE(VALUES(firstName), firstName), status = 'active', consentStatus = 'subscribed', subscriptionSource = VALUES(subscriptionSource), consentIp = VALUES(consentIp), manageTokenHash = VALUES(manageTokenHash), subscribedAt = NOW(), unsubscribedAt = NULL, updatedAt = NOW()
    `);
    const [subscriberRows] = await db.execute(sql`SELECT id FROM subscribers WHERE email = ${email} LIMIT 1`) as any;
    const subscriberId = Number(subscriberRows?.[0]?.id);
    for (const interest of data.interests) {
      await db.execute(sql`
        INSERT INTO subscriber_preferences (subscriberId, interest, enabled)
        VALUES (${subscriberId}, ${interest}, true)
        ON DUPLICATE KEY UPDATE enabled = true, updatedAt = NOW()
      `);
    }
    await saveCartEvent("subscriber_subscribed", { source: data.source, interests: data.interests }, email, undefined);
    res.json({ success: true, status: existing ? "resubscribed" : "subscribed", message: "You're in. Welcome to Build Level.", manageUrl: `/email/preferences/${token}` });
  } catch (error: any) {
    const validationMessage = (error as any)?.issues?.[0]?.message || (error as any)?.errors?.[0]?.message;
    const message = error instanceof z.ZodError ? validationMessage || "Invalid subscription details" : "Subscription failed. Please try again or contact support.";
    res.status(400).json({ error: message });
  }
});

router.get("/email/preferences/:token", async (req, res) => {
  try {
    await ensureRetentionTables();
    const tokenHash = hashToken(String(req.params.token || ""));
    const db = await getDb();
    const [rows] = await db.execute(sql`SELECT * FROM subscribers WHERE manageTokenHash = ${tokenHash} LIMIT 1`) as any;
    const subscriber = rows?.[0];
    if (!subscriber) { res.status(404).json({ error: "Preferences link is invalid" }); return; }
    const [prefs] = await db.execute(sql`SELECT interest, enabled FROM subscriber_preferences WHERE subscriberId = ${subscriber.id}`) as any;
    res.json({ success: true, subscriber: { email: subscriber.email, firstName: subscriber.firstName, status: subscriber.status, interests: prefs } });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/email/preferences/:token", async (req, res) => {
  try {
    await ensureRetentionTables();
    const schema = z.object({ firstName: z.string().max(160).optional().default(""), interests: z.array(z.enum(SUBSCRIPTION_INTERESTS)).min(1), active: z.boolean().default(true) });
    const data = schema.parse(req.body);
    const tokenHash = hashToken(String(req.params.token || ""));
    const db = await getDb();
    const [rows] = await db.execute(sql`SELECT * FROM subscribers WHERE manageTokenHash = ${tokenHash} LIMIT 1`) as any;
    const subscriber = rows?.[0];
    if (!subscriber) { res.status(404).json({ error: "Preferences link is invalid" }); return; }
    await db.execute(sql`UPDATE subscribers SET firstName = ${cleanText(data.firstName, 160) || null}, status = ${data.active ? "active" : "unsubscribed"}, consentStatus = ${data.active ? "subscribed" : "unsubscribed"}, unsubscribedAt = ${data.active ? null : new Date()}, updatedAt = NOW() WHERE id = ${subscriber.id}`);
    await db.execute(sql`UPDATE subscriber_preferences SET enabled = false WHERE subscriberId = ${subscriber.id}`);
    for (const interest of data.interests) {
      await db.execute(sql`INSERT INTO subscriber_preferences (subscriberId, interest, enabled) VALUES (${subscriber.id}, ${interest}, true) ON DUPLICATE KEY UPDATE enabled = true, updatedAt = NOW()`);
    }
    await saveCartEvent(data.active ? "subscriber_preferences_updated" : "subscriber_unsubscribed", { interests: data.interests }, subscriber.email, undefined);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/email/unsubscribe/:token", async (req, res) => {
  try {
    await ensureRetentionTables();
    const tokenHash = hashToken(String(req.params.token || ""));
    const db = await getDb();
    const [rows] = await db.execute(sql`SELECT * FROM subscribers WHERE manageTokenHash = ${tokenHash} LIMIT 1`) as any;
    const subscriber = rows?.[0];
    if (!subscriber) { res.status(404).json({ error: "Unsubscribe link is invalid" }); return; }
    await db.execute(sql`UPDATE subscribers SET status = 'unsubscribed', consentStatus = 'unsubscribed', unsubscribedAt = NOW(), updatedAt = NOW() WHERE id = ${subscriber.id}`);
    await db.execute(sql`UPDATE abandoned_carts SET status = 'unsubscribed', updatedAt = NOW() WHERE customerEmail = ${subscriber.email} AND status = 'eligible'`);
    await saveCartEvent("subscriber_unsubscribed", {}, subscriber.email, undefined);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/admin/subscribers", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const db = await getDb();
    const search = `%${cleanText(req.query.search, 160)}%`;
    const interest = cleanText(req.query.interest, 64);
    const status = cleanText(req.query.status, 32);
    const source = cleanText(req.query.source, 128);
    const [rows] = await db.execute(sql`
      SELECT s.*, GROUP_CONCAT(CONCAT(p.interest, ':', p.enabled) ORDER BY p.interest) AS preferences
      FROM subscribers s
      LEFT JOIN subscriber_preferences p ON p.subscriberId = s.id
      WHERE (${search} = '%%' OR s.email LIKE ${search} OR s.firstName LIKE ${search})
        AND (${status} = '' OR s.status = ${status})
        AND (${source} = '' OR s.subscriptionSource = ${source})
        AND (${interest} = '' OR EXISTS (SELECT 1 FROM subscriber_preferences sp WHERE sp.subscriberId = s.id AND sp.interest = ${interest} AND sp.enabled = true))
      GROUP BY s.id
      ORDER BY s.createdAt DESC
      LIMIT 500
    `) as any;
    res.json(rows || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/admin/subscribers/:id", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const id = Number(req.params.id);
    const schema = z.object({ status: z.enum(["active", "unsubscribed", "blocked"]).optional(), firstName: z.string().max(160).optional(), interests: z.array(z.enum(SUBSCRIPTION_INTERESTS)).optional() });
    const data = schema.parse(req.body);
    const db = await getDb();
    if (data.status) await db.execute(sql`UPDATE subscribers SET status = ${data.status}, consentStatus = ${data.status === "active" ? "subscribed" : data.status}, unsubscribedAt = ${data.status === "active" ? null : new Date()}, updatedAt = NOW() WHERE id = ${id}`);
    if (data.firstName !== undefined) await db.execute(sql`UPDATE subscribers SET firstName = ${cleanText(data.firstName, 160) || null}, updatedAt = NOW() WHERE id = ${id}`);
    if (data.interests) {
      await db.execute(sql`UPDATE subscriber_preferences SET enabled = false WHERE subscriberId = ${id}`);
      for (const interest of data.interests) await db.execute(sql`INSERT INTO subscriber_preferences (subscriberId, interest, enabled) VALUES (${id}, ${interest}, true) ON DUPLICATE KEY UPDATE enabled = true, updatedAt = NOW()`);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/admin/subscribers/export.csv", requireAdmin, async (_req, res) => {
  await ensureRetentionTables();
  const db = await getDb();
  const [rows] = await db.execute(sql`SELECT email, firstName, status, subscriptionSource, subscribedAt, unsubscribedAt FROM subscribers ORDER BY createdAt DESC`) as any;
  const csv = ["email,firstName,status,subscriptionSource,subscribedAt,unsubscribedAt", ...(rows || []).map((row: any) =>
    [row.email, row.firstName || "", row.status, row.subscriptionSource || "", row.subscribedAt || "", row.unsubscribedAt || ""].map(value => `"${String(value).replace(/"/g, "\"\"")}"`).join(",")
  )].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=build-level-subscribers.csv");
  res.send(csv);
});

router.get("/admin/abandoned-carts", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    await markInactiveCartsAbandoned();
    const db = await getDb();
    const status = cleanText(req.query.status, 32);
    const [rows] = await db.execute(sql`
      SELECT c.*, a.status AS recoveryStatus, a.reminderStage, a.reminderCount AS recoveryReminderCount, a.recoveredAt, a.completedOrderId AS recoveredOrderId
      FROM carts c
      LEFT JOIN abandoned_carts a ON a.cartId = c.id
      WHERE (${status} = '' OR c.status = ${status} OR a.status = ${status})
      ORDER BY c.updatedAt DESC
      LIMIT 300
    `) as any;
    res.json(rows || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/admin/abandoned-carts/settings", requireAdmin, async (_req, res) => {
  await ensureRetentionTables();
  res.json(await getRetentionSettings());
});

router.post("/admin/abandoned-carts/settings", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const schema = z.object({
      recoveryEnabled: z.boolean(),
      firstReminderHours: z.number().min(0).max(720),
      secondReminderHours: z.number().min(0).max(720),
      finalReminderHours: z.number().min(0).max(720),
      abandonedAfterMinutes: z.number().min(5).max(10080),
      reminderSubject: z.string().max(255),
      reminderIntro: z.string().max(1000),
    });
    const data = schema.parse(req.body);
    const db = await getDb();
    const entries: Record<string, string> = {
      cart_recovery_enabled: String(data.recoveryEnabled),
      cart_recovery_first_hours: String(data.firstReminderHours),
      cart_recovery_second_hours: String(data.secondReminderHours),
      cart_recovery_final_hours: String(data.finalReminderHours),
      cart_abandoned_after_minutes: String(data.abandonedAfterMinutes),
      cart_recovery_subject: data.reminderSubject,
      cart_recovery_intro: data.reminderIntro,
    };
    for (const [key, value] of Object.entries(entries)) {
      await db.execute(sql`INSERT INTO site_settings (\`key\`, value, updatedAt) VALUES (${key}, ${value}, NOW()) ON DUPLICATE KEY UPDATE value = VALUES(value), updatedAt = NOW()`);
    }
    res.json({ success: true, settings: await getRetentionSettings() });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/admin/abandoned-carts/:id", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const saved = await getCartWithItemsById(Number(req.params.id));
    if (!saved.cart) { res.status(404).json({ error: "Cart not found" }); return; }
    res.json({ cart: sanitizeCartResponse(saved.cart, saved.items) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/admin/abandoned-carts/:id", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const id = Number(req.params.id);
    const schema = z.object({ action: z.enum(["stop", "resolve", "enable", "delete_expired"]) });
    const { action } = schema.parse(req.body);
    const db = await getDb();
    if (action === "stop") {
      await db.execute(sql`UPDATE carts SET remindersDisabled = true, status = 'disabled', updatedAt = NOW() WHERE id = ${id}`);
      await db.execute(sql`UPDATE abandoned_carts SET status = 'paused', updatedAt = NOW() WHERE cartId = ${id}`);
    } else if (action === "resolve") {
      await db.execute(sql`UPDATE carts SET remindersDisabled = true, status = 'resolved', updatedAt = NOW() WHERE id = ${id}`);
      await db.execute(sql`UPDATE abandoned_carts SET status = 'resolved', updatedAt = NOW() WHERE cartId = ${id}`);
    } else if (action === "enable") {
      await db.execute(sql`UPDATE carts SET remindersDisabled = false, status = 'active', updatedAt = NOW() WHERE id = ${id}`);
      await db.execute(sql`UPDATE abandoned_carts SET status = 'eligible', updatedAt = NOW() WHERE cartId = ${id}`);
    } else {
      await db.execute(sql`DELETE FROM cart_items WHERE cartId = ${id} AND ${new Date()} > (SELECT expiresAt FROM carts WHERE id = ${id})`);
      await db.execute(sql`DELETE FROM carts WHERE id = ${id} AND expiresAt < NOW()`);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/admin/abandoned-carts/:id/reminder", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const id = Number(req.params.id);
    const db = await getDb();
    const saved = await getCartWithItemsById(id);
    if (!saved.cart || !saved.cart.customerEmail) { res.status(400).json({ error: "Cart has no customer email" }); return; }
    const [subscriberRows] = await db.execute(sql`SELECT status FROM subscribers WHERE email = ${saved.cart.customerEmail} LIMIT 1`) as any;
    if (subscriberRows?.[0]?.status === "unsubscribed" || subscriberRows?.[0]?.status === "blocked") {
      res.status(403).json({ error: "Customer is unsubscribed or blocked" });
      return;
    }
    const token = await createRecoveryToken(id);
    const settings = await getRetentionSettings();
    const origin = getFrontendOrigin(req);
    const recoveryUrl = `${origin}/cart/recover/${token}`;
    const manageToken = await getOrCreateManageToken(saved.cart.customerEmail);
    const unsubscribeUrl = `${origin}/email/preferences/${manageToken}`;
    const itemsText = saved.items.map((item: any) => `${item.productName} (${item.selectedVariant || item.selectedSize || item.productType}) - $${Number(item.itemTotal).toFixed(2)}`).join("\n");
    const html = `
      <div style="background:#0a0a0a;color:#f0ede8;font-family:Arial,sans-serif;padding:28px">
        <h1 style="color:#ff6600;text-transform:uppercase">You left something behind</h1>
        <p>${settings.reminderIntro}</p>
        <pre style="white-space:pre-wrap;background:#111;padding:16px;border:1px solid #2a2a2a">${itemsText}</pre>
        <p><strong>Cart subtotal:</strong> $${Number(saved.cart.subtotal).toFixed(2)}</p>
        <p><a href="${recoveryUrl}" style="background:#c0392b;color:#fff;padding:12px 18px;text-decoration:none;text-transform:uppercase">Return to Cart</a></p>
        <p>Need help? Contact ${BUSINESS_EMAIL}.</p>
        <p style="font-size:12px;color:#999"><a href="${unsubscribeUrl}" style="color:#999">Unsubscribe or manage preferences</a></p>
      </div>
    `;
    if (!isEmailConfigured()) {
      await saveCartEvent("abandoned_cart_email_skipped", { reason: "email_not_configured" }, saved.cart.customerEmail, id);
      res.json({ success: true, skipped: true, message: "Email is not configured; reminder was logged but not sent.", recoveryUrl });
      return;
    }
    await sendCustomerEmail({ to: saved.cart.customerEmail, subject: settings.reminderSubject, text: `${settings.reminderIntro}\n\n${itemsText}\n\nReturn to cart: ${recoveryUrl}\nUnsubscribe: ${unsubscribeUrl}`, html });
    await db.execute(sql`INSERT INTO cart_reminders (cartId, stage, status, subject, sentAt) VALUES (${id}, ${cleanText(req.body?.stage || "manual", 32)}, 'sent', ${settings.reminderSubject}, NOW()) ON DUPLICATE KEY UPDATE status = 'sent', sentAt = NOW(), subject = VALUES(subject)`);
    await db.execute(sql`UPDATE carts SET reminderCount = reminderCount + 1, updatedAt = NOW() WHERE id = ${id}`);
    await db.execute(sql`UPDATE abandoned_carts SET reminderCount = reminderCount + 1, lastReminderAt = NOW(), updatedAt = NOW() WHERE cartId = ${id}`);
    await saveCartEvent("abandoned_cart_email_sent", { stage: req.body?.stage || "manual" }, saved.cart.customerEmail, id);
    res.json({ success: true, recoveryUrl });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/admin/retention/summary", requireAdmin, async (_req, res) => {
  try {
    await ensureRetentionTables();
    await markInactiveCartsAbandoned();
    const db = await getDb();
    const [[cartCounts], [subscriberCounts], [productRows]] = await Promise.all([
      db.execute(sql`SELECT SUM(status='active') AS activeCarts, SUM(status='abandoned') AS abandonedCarts, SUM(status IN ('recovered','converted')) AS recoveredCarts, SUM(CASE WHEN status IN ('recovered','converted') THEN subtotal ELSE 0 END) AS revenueRecovered FROM carts`) as any,
      db.execute(sql`SELECT COUNT(*) AS totalSubscribers, SUM(status='active') AS activeSubscribers, SUM(status='unsubscribed') AS unsubscribeCount, SUM(createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS newSubscribersThisMonth FROM subscribers`) as any,
      db.execute(sql`SELECT productName, productType, SUM(quantity) AS quantity FROM cart_items GROUP BY productName, productType ORDER BY quantity DESC LIMIT 10`) as any,
    ]);
    res.json({ carts: cartCounts?.[0] || {}, subscribers: subscriberCounts?.[0] || {}, mostAddedProducts: productRows || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/admin/email/monthly-digest/settings", requireAdmin, async (_req, res) => {
  try {
    await ensureRetentionTables();
    res.json(await getMonthlyDigestSettings());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/admin/email/monthly-digest/settings", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const data = z.object({
      enabled: z.boolean(),
      dayOfMonth: z.number().min(1).max(28),
      dayName: z.string().max(64),
      time: z.string().max(16),
      timezone: z.string().max(64),
      subject: z.string().max(255),
      introduction: z.string().max(1000),
      status: z.string().max(64).default("draft"),
    }).parse(req.body);
    await Promise.all([
      upsertDigestSetting("monthly_digest_enabled", String(data.enabled)),
      upsertDigestSetting("monthly_digest_day_of_month", String(data.dayOfMonth)),
      upsertDigestSetting("monthly_digest_day_name", data.dayName),
      upsertDigestSetting("monthly_digest_time", data.time),
      upsertDigestSetting("monthly_digest_timezone", data.timezone),
      upsertDigestSetting("monthly_digest_subject", data.subject),
      upsertDigestSetting("monthly_digest_intro", data.introduction),
      upsertDigestSetting("monthly_digest_status", data.status),
    ]);
    res.json({ success: true, settings: await getMonthlyDigestSettings() });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/admin/email/monthly-digest/queue/refresh", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const data = z.object({ audience: z.array(z.string()).optional().default(["all_updates"]), currentMonthOnly: z.boolean().optional().default(false) }).parse(req.body || {});
    await refreshMonthlyDigestQueue(data.audience, data.currentMonthOnly);
    res.json({ success: true, queue: await getDigestQueueRows(data.audience, data.currentMonthOnly) });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/admin/email/monthly-digest/queue", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const audience = String(req.query.audience || "all_updates").split(",").filter(Boolean);
    const currentMonthOnly = String(req.query.currentMonthOnly || "") === "true";
    res.json(await getDigestQueueRows(audience, currentMonthOnly));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/admin/email/monthly-digest/queue/:id", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const id = Number(req.params.id);
    const data = z.object({ included: z.boolean().optional(), sortOrder: z.number().optional() }).parse(req.body);
    const db = await getDb();
    await db.execute(sql`UPDATE monthly_digest_queue SET included = COALESCE(${data.included ?? null}, included), sortOrder = COALESCE(${data.sortOrder ?? null}, sortOrder), updatedAt = NOW() WHERE id = ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/admin/email/monthly-digest/preview", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const settings = await getMonthlyDigestSettings();
    const audience = String(req.query.audience || "all_updates").split(",").filter(Boolean);
    const queue = await getDigestQueueRows(audience);
    const subscribers = await getEligibleSubscriberRows(audience);
    res.json({ subject: settings.subject, html: buildMonthlyDigestHtml(settings, queue, getFrontendOrigin(req)), eligibleSubscribers: subscribers.length, queue });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/admin/email/monthly-digest/test", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const data = z.object({ email: z.string().email(), audience: z.array(z.string()).optional().default(["all_updates"]) }).parse(req.body);
    const settings = await getMonthlyDigestSettings();
    const queue = await getDigestQueueRows(data.audience);
    if (!isEmailConfigured()) {
      res.json({ success: true, skipped: true, message: "Email is not configured; test was not sent." });
      return;
    }
    await sendCustomerEmail({ to: data.email, subject: `[TEST] ${settings.subject}`, text: settings.introduction, html: buildMonthlyDigestHtml(settings, queue) });
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/admin/email/monthly-digest/send", requireAdmin, async (req, res) => {
  try {
    await ensureRetentionTables();
    const data = z.object({ confirm: z.literal(true), audience: z.array(z.string()).optional().default(["all_updates"]) }).parse(req.body);
    const settings = await getMonthlyDigestSettings();
    const queue = await getDigestQueueRows(data.audience);
    const subscribers = await getEligibleSubscriberRows(data.audience);
    const db = await getDb();
    const [existingCampaigns] = await db.execute(sql`SELECT id FROM email_campaigns WHERE campaignType = 'newsletter' AND subject = ${settings.subject} AND status = 'sent' AND createdAt >= DATE_FORMAT(NOW(), '%Y-%m-01') LIMIT 1`) as any;
    if (existingCampaigns?.[0]) {
      res.status(409).json({ error: "This Monthly Digest has already been sent this month." });
      return;
    }
    await db.execute(sql`INSERT INTO email_campaigns (campaignType, subject, bodyHtml, audience, status, sentAt) VALUES ('newsletter', ${settings.subject}, ${buildMonthlyDigestHtml(settings, queue)}, ${JSON.stringify(data.audience)}, 'sent', NOW())`);
    const [campaignRows] = await db.execute(sql`SELECT id FROM email_campaigns ORDER BY id DESC LIMIT 1`) as any;
    const campaignId = Number(campaignRows?.[0]?.id || 0);
    let sent = 0;
    let failed = 0;
    for (const subscriber of subscribers) {
      try {
        await db.execute(sql`INSERT INTO email_campaign_recipients (campaignId, subscriberId, email, status, sentAt) VALUES (${campaignId}, ${subscriber.id}, ${subscriber.email}, ${isEmailConfigured() ? "sent" : "skipped"}, NOW()) ON DUPLICATE KEY UPDATE status = status`);
        if (isEmailConfigured()) await sendCustomerEmail({ to: subscriber.email, subject: settings.subject, text: settings.introduction, html: buildMonthlyDigestHtml(settings, queue) });
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    res.json({ success: true, campaignId, eligibleSubscribers: subscribers.length, sent, failed });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
