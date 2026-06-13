import { Router, Request, Response } from "express";
import { eq, asc, desc, sql } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";
import multer from "multer";
import crypto from "crypto";
import { getDb } from "../db/index.js";
import {
  products, blogPosts, digitalProducts, affiliateProducts,
  membershipTiers, siteSettings, aiVideos, orders, orderItems, fulfillmentAttempts, orderEvents, productVariants
} from "../db/schema.js";
import { requireAdmin, verifyAdminPassword, signAdminToken, ADMIN_COOKIE } from "../middleware/adminAuth.js";
import { ALLOWED_IMAGE_EXTENSIONS, MAX_DIGITAL_FILE_SIZE_BYTES, isStorageConfigured, uploadObject } from "../storage/objectStorage.js";
import { isEmailConfigured, sendCustomerEmail } from "../services/email.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DIGITAL_FILE_SIZE_BYTES },
});

const SHOPIFY_API_VERSION = "2024-01";

const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "x",
  "pinterest",
] as const;

type SocialPlatform = typeof SOCIAL_PLATFORMS[number];

const integrationSettingKeys = [
  "shopify_disabled",
  "printify_disabled",
  "stripe_disabled",
  "tidio_disabled",
  "tidio_enabled",
  "tidio_public_key",
  "tidio_chat_controls",
  "tidio_chatbot_settings",
  "social_scheduler_enabled",
  "social_campaign_name",
  "social_sharing_enabled",
  ...SOCIAL_PLATFORMS.flatMap((platform) => [
    `social_${platform}_enabled`,
    `social_${platform}_handle`,
    `social_${platform}_url`,
    `social_${platform}_analytics_enabled`,
  ]),
];

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

async function isIntegrationDisabled(provider: string) {
  const settings = await getSettingsMap([`${provider}_disabled`]);
  return settings[`${provider}_disabled`] === "true";
}

let fulfillmentTablesEnsured = false;
async function ensureFulfillmentTables() {
  if (fulfillmentTablesEnsured) return;
  const db = await getDb();
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      productId INT NOT NULL,
      source ENUM('manual','printify','shopify') NOT NULL DEFAULT 'manual',
      printifyProductId VARCHAR(128) NULL,
      printifyVariantId VARCHAR(128) NULL,
      shopifyProductId VARCHAR(128) NULL,
      shopifyVariantId VARCHAR(128) NULL,
      label VARCHAR(255) NOT NULL,
      size VARCHAR(128) NULL,
      color VARCHAR(128) NULL,
      price DECIMAL(10,2) NOT NULL,
      available BOOLEAN NOT NULL DEFAULT true,
      enabled BOOLEAN NOT NULL DEFAULT true,
      printProviderId VARCHAR(128) NULL,
      blueprintId VARCHAR(128) NULL,
      imageUrl TEXT NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_printify_variant (printifyProductId, printifyVariantId),
      INDEX idx_product_variants_product (productId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orderToken VARCHAR(128) NULL UNIQUE,
      customerFirstName VARCHAR(128) NULL,
      customerLastName VARCHAR(128) NULL,
      customerName VARCHAR(255) NULL,
      customerEmail VARCHAR(320) NOT NULL,
      customerPhone VARCHAR(64) NULL,
      shippingAddress JSON NULL,
      stripeEventId VARCHAR(128) NULL UNIQUE,
      stripeCheckoutSessionId VARCHAR(128) NULL UNIQUE,
      stripePaymentIntentId VARCHAR(128) NULL UNIQUE,
      stripePaymentStatus VARCHAR(64) NULL,
      orderTotal DECIMAL(10,2) NULL,
      currency VARCHAR(8) DEFAULT 'usd',
      orderType ENUM('apparel','digital','mixed') NOT NULL DEFAULT 'apparel',
      fulfillmentStatus ENUM('Payment Pending','Paid','Order Received','Awaiting Fulfillment','Ready for Printify Test','Processing','Printify Order Created','Awaiting Production Approval','Sent to Production','In Production','Partially Shipped','Shipped','Delivered','Fulfillment Payment Issue','Requires Admin Review','Failed','Cancelled') NOT NULL DEFAULT 'Payment Pending',
      printifyOrderId VARCHAR(128) NULL UNIQUE,
      printifyExternalId VARCHAR(128) NULL,
      printifyStatus VARCHAR(128) NULL,
      customerStatus VARCHAR(128) NULL,
      printifyApiResponse JSON NULL,
      errorMessage TEXT NULL,
      lastSyncAt TIMESTAMP NULL,
      lastSyncFailedAt TIMESTAMP NULL,
      lastSyncError TEXT NULL,
      confirmationEmailSent BOOLEAN NOT NULL DEFAULT false,
      confirmationEmailSentAt TIMESTAMP NULL,
      confirmationEmailStatus VARCHAR(64) NULL,
      confirmationEmailError TEXT NULL,
      productionEmailSentAt TIMESTAMP NULL,
      shippingEmailSentAt TIMESTAMP NULL,
      deliveryEmailSentAt TIMESTAMP NULL,
      retryCount INT NOT NULL DEFAULT 0,
      processing BOOLEAN NOT NULL DEFAULT false,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`ALTER TABLE orders MODIFY fulfillmentStatus ENUM('Payment Pending','Paid','Order Received','Awaiting Fulfillment','Ready for Printify Test','Processing','Printify Order Created','Awaiting Production Approval','Sent to Production','In Production','Partially Shipped','Shipped','Delivered','Fulfillment Payment Issue','Requires Admin Review','Failed','Cancelled') NOT NULL DEFAULT 'Payment Pending'`)).catch(() => undefined);
  for (const statement of [
    `ALTER TABLE orders ADD COLUMN orderToken VARCHAR(128) NULL UNIQUE`,
    `ALTER TABLE orders ADD COLUMN customerFirstName VARCHAR(128) NULL`,
    `ALTER TABLE orders ADD COLUMN customerLastName VARCHAR(128) NULL`,
    `ALTER TABLE orders ADD COLUMN customerStatus VARCHAR(128) NULL`,
    `ALTER TABLE orders ADD COLUMN lastSyncAt TIMESTAMP NULL`,
    `ALTER TABLE orders ADD COLUMN lastSyncFailedAt TIMESTAMP NULL`,
    `ALTER TABLE orders ADD COLUMN lastSyncError TEXT NULL`,
    `ALTER TABLE orders ADD COLUMN confirmationEmailSent BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE orders ADD COLUMN confirmationEmailSentAt TIMESTAMP NULL`,
    `ALTER TABLE orders ADD COLUMN confirmationEmailStatus VARCHAR(64) NULL`,
    `ALTER TABLE orders ADD COLUMN confirmationEmailError TEXT NULL`,
    `ALTER TABLE orders ADD COLUMN productionEmailSentAt TIMESTAMP NULL`,
    `ALTER TABLE orders ADD COLUMN shippingEmailSentAt TIMESTAMP NULL`,
    `ALTER TABLE orders ADD COLUMN deliveryEmailSentAt TIMESTAMP NULL`,
  ]) await db.execute(sql.raw(statement)).catch(() => undefined);
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orderId INT NOT NULL,
      productId INT NULL,
      productName VARCHAR(255) NOT NULL,
      productType ENUM('apparel','digital') NOT NULL DEFAULT 'apparel',
      quantity INT NOT NULL DEFAULT 1,
      selectedSize VARCHAR(255) NULL,
      selectedColor VARCHAR(128) NULL,
      printifyProductId VARCHAR(128) NULL,
      printifyVariantId VARCHAR(128) NULL,
      unitPrice DECIMAL(10,2) NULL,
      fulfillmentSource ENUM('printify','digital','manual','none') NOT NULL DEFAULT 'none',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_order_items_order (orderId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS fulfillment_attempts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orderId INT NOT NULL,
      attemptNumber INT NOT NULL DEFAULT 1,
      action VARCHAR(128) NOT NULL,
      status ENUM('pending','success','failed','skipped') NOT NULL DEFAULT 'pending',
      requestPayload JSON NULL,
      responsePayload JSON NULL,
      errorMessage TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fulfillment_attempts_order (orderId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS order_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orderId INT NULL,
      eventType VARCHAR(128) NOT NULL,
      stripeEventId VARCHAR(128) NULL UNIQUE,
      printifyEventId VARCHAR(128) NULL,
      payload JSON NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_order_events_order (orderId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS order_shipments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orderId INT NOT NULL,
      printifyShipmentId VARCHAR(128) NULL,
      carrier VARCHAR(128) NULL,
      trackingNumber VARCHAR(255) NULL,
      trackingUrl TEXT NULL,
      status VARCHAR(64) NULL,
      shippedAt TIMESTAMP NULL,
      deliveredAt TIMESTAMP NULL,
      payload JSON NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_order_tracking (orderId, trackingNumber),
      INDEX idx_order_shipments_order (orderId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS order_notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orderId INT NOT NULL,
      notificationType ENUM('confirmation','production','shipping','delivery','admin_alert','tracking_resend') NOT NULL,
      recipientEmail VARCHAR(320) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      status ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
      attemptCount INT NOT NULL DEFAULT 0,
      lastError TEXT NULL,
      sentAt TIMESTAMP NULL,
      metadata JSON NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_order_notification (orderId, notificationType, recipientEmail),
      INDEX idx_order_notifications_order (orderId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS order_alerts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orderId INT NOT NULL,
      alertType VARCHAR(128) NOT NULL,
      message TEXT NOT NULL,
      status ENUM('open','resolved') NOT NULL DEFAULT 'open',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolvedAt TIMESTAMP NULL,
      UNIQUE KEY uq_open_order_alert (orderId, alertType, status),
      INDEX idx_order_alerts_order (orderId)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS order_issues (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orderId INT NOT NULL,
      productId INT NULL,
      issueType VARCHAR(128) NOT NULL,
      description TEXT NOT NULL,
      evidenceUrl TEXT NULL,
      preferredResolution VARCHAR(128) NULL,
      status ENUM('reported','admin_review','submitted_to_printify','approved','rejected','closed') NOT NULL DEFAULT 'reported',
      printifyIssueId VARCHAR(128) NULL,
      replacementOrderId VARCHAR(128) NULL,
      refundAmount DECIMAL(10,2) NULL,
      adminNotes TEXT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_order_issues_order (orderId)
    )
  `));
  await db.execute(sql.raw(`ALTER TABLE orders ADD UNIQUE KEY unique_printify_order_id (printifyOrderId)`)).catch(() => undefined);
  fulfillmentTablesEnsured = true;
}

function maskSecret(value?: string | null) {
  if (!value) return "";
  if (value.length <= 8) return "configured";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
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

function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

function socialEnvStatus(platform: SocialPlatform) {
  const upper = platform === "x" ? "X" : platform.toUpperCase();
  return {
    clientIdConfigured: !!process.env[`${upper}_CLIENT_ID`],
    clientSecretConfigured: !!process.env[`${upper}_CLIENT_SECRET`],
    accessTokenConfigured: !!process.env[`${upper}_ACCESS_TOKEN`],
  };
}

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
    res.json(rows.map(cleanProductForResponse));
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
    if (!data.published) {
      data.hidden = true;
      data.inStock = false;
      data.featured = false;
    }
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
    if (data.published === false) {
      updateData.hidden = true;
      updateData.inStock = false;
      updateData.featured = false;
    } else if (data.published === true && data.hidden === undefined) {
      updateData.hidden = false;
      updateData.delisted = false;
    }
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

// ─── Fulfillment / Printify Orders ────────────────────────────────────────────
router.get("/fulfillment/orders", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureFulfillmentTables();
    const db = await getDb();
    const status = String(req.query.status || "");
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
    res.json(status ? rows.filter(row => row.fulfillmentStatus === status) : rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/fulfillment/orders/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureFulfillmentTables();
    const id = Number(req.params.id);
    const db = await getDb();
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    const [items, attempts, events, shipments, notifications, alerts, issues] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, id)),
      db.select().from(fulfillmentAttempts).where(eq(fulfillmentAttempts.orderId, id)).orderBy(desc(fulfillmentAttempts.createdAt)),
      db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(desc(orderEvents.createdAt)),
      db.execute(sql`SELECT * FROM order_shipments WHERE orderId = ${id} ORDER BY createdAt DESC`) as any,
      db.execute(sql`SELECT * FROM order_notifications WHERE orderId = ${id} ORDER BY createdAt DESC`) as any,
      db.execute(sql`SELECT * FROM order_alerts WHERE orderId = ${id} ORDER BY status ASC, createdAt DESC`) as any,
      db.execute(sql`SELECT * FROM order_issues WHERE orderId = ${id} ORDER BY createdAt DESC`) as any,
    ]);
    res.json({ order, items, attempts, events, shipments: shipments?.[0] || [], notifications: notifications?.[0] || [], alerts: alerts?.[0] || [], issues: issues?.[0] || [] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

function validateAdminShippingAddress(address: any) {
  if (!address) return "Missing shipping address";
  if (!String(address.name || "").trim()) return "Missing customer name";
  if (!String(address.line1 || "").trim()) return "Missing address line 1";
  if (!String(address.city || "").trim()) return "Missing city";
  if (!String(address.state || "").trim()) return "Missing state/region";
  if (!String(address.postal_code || "").trim()) return "Missing postal code";
  if (!String(address.country || "").trim()) return "Missing country";
  if (String(address.country || "").trim().length !== 2) return "Country must be a 2-letter code";
  return "";
}

function splitCustomerName(name?: string | null) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "Customer" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function createPrintifyOrderFromInternalOrder(orderId: number) {
  await ensureFulfillmentTables();
  const db = await getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.printifyOrderId) return { skipped: true, reason: "Printify order already exists", order };
  if (order.processing) return { skipped: true, reason: "Order is already processing", order };
  if (process.env.PRINTIFY_CREATE_ORDERS_ENABLED !== "true") throw new Error("Printify order creation is disabled. Set PRINTIFY_CREATE_ORDERS_ENABLED=true only for an approved test.");
  if (process.env.PRINTIFY_SHIPPING_METHOD_CONFIRMED !== "true") throw new Error("Printify shipping method is not confirmed. Set PRINTIFY_SHIPPING_METHOD_CONFIRMED=true only after validating the method for the product/provider/destination.");

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const shippingAddress = order.shippingAddress as any;
  const validationErrors: string[] = [];
  const addressError = validateAdminShippingAddress(shippingAddress);
  if (order.stripePaymentStatus !== "paid") validationErrors.push(`Payment status is ${order.stripePaymentStatus || "unknown"}`);
  if (addressError) validationErrors.push(addressError);
  for (const item of items.filter(item => item.fulfillmentSource === "printify")) {
    if (!item.printifyProductId) validationErrors.push(`Missing Printify product ID for ${item.productName}`);
    if (!item.printifyVariantId) validationErrors.push(`Missing Printify variant ID for ${item.productName}`);
  }
  if (validationErrors.length > 0) {
    await db.update(orders).set({ fulfillmentStatus: "Requires Admin Review", errorMessage: validationErrors.join("; "), processing: false, updatedAt: new Date() }).where(eq(orders.id, order.id));
    throw new Error(validationErrors.join("; "));
  }

  const lineItems = items
    .filter(item => item.fulfillmentSource === "printify")
    .map(item => ({ product_id: item.printifyProductId, variant_id: Number(item.printifyVariantId), quantity: item.quantity }));
  if (lineItems.length === 0) throw new Error("No Printify line items available");

  const { firstName, lastName } = splitCustomerName(String(shippingAddress?.name || order.customerName || ""));
  const { shopId } = await getPrintifyCredentials();
  if (!shopId) throw new Error("Printify shop ID is not configured");
  const payload = {
    external_id: order.stripeCheckoutSessionId || `build-level-order-${order.id}`,
    label: `Build Level Order ${order.id}`,
    line_items: lineItems,
    shipping_method: Number(process.env.PRINTIFY_SHIPPING_METHOD || 1),
    send_shipping_notification: false,
    address_to: {
      first_name: firstName,
      last_name: lastName,
      email: order.customerEmail,
      phone: order.customerPhone || "",
      country: shippingAddress.country,
      region: shippingAddress.state || "",
      address1: shippingAddress.line1,
      address2: shippingAddress.line2 || "",
      city: shippingAddress.city,
      zip: shippingAddress.postal_code,
    },
  };

  const attemptNumber = order.retryCount + 1;
  await db.update(orders).set({ processing: true, fulfillmentStatus: "Processing", updatedAt: new Date() }).where(eq(orders.id, order.id));
  await db.insert(fulfillmentAttempts).values({ orderId: order.id, attemptNumber, action: "create_printify_order", status: "pending", requestPayload: payload as any, createdAt: new Date() });
  try {
    const response = await printifyRequestWithBody(`/shops/${shopId}/orders.json`, "POST", payload);
    await db.update(orders).set({
      printifyOrderId: String((response as any).id || ""),
      printifyExternalId: String(payload.external_id),
      printifyStatus: String((response as any).status || "created"),
      printifyApiResponse: response as any,
      fulfillmentStatus: "Awaiting Production Approval",
      processing: false,
      errorMessage: null,
      retryCount: attemptNumber,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    await db.insert(fulfillmentAttempts).values({ orderId: order.id, attemptNumber, action: "create_printify_order", status: "success", responsePayload: response as any, createdAt: new Date() });
    await db.insert(orderEvents).values({ orderId: order.id, eventType: "printify.order_created", payload: response as any, createdAt: new Date() });
    return { success: true, response };
  } catch (error: any) {
    await db.update(orders).set({
      fulfillmentStatus: "Failed",
      processing: false,
      errorMessage: error.message,
      retryCount: attemptNumber,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    await db.insert(fulfillmentAttempts).values({ orderId: order.id, attemptNumber, action: "create_printify_order", status: "failed", requestPayload: payload as any, errorMessage: error.message, createdAt: new Date() });
    throw error;
  }
}

function normalizeCountryForShipping(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/[^a-z]/g, "");
  const countryMap: Record<string, string> = {
    us: "US",
    usa: "US",
    unitedstates: "US",
    unitedstatesofamerica: "US",
    america: "US",
    uk: "GB",
    unitedkingdom: "GB",
    greatbritain: "GB",
    canada: "CA",
    ca: "CA",
    australia: "AU",
    au: "AU",
    germany: "DE",
    de: "DE",
    france: "FR",
    fr: "FR",
    japan: "JP",
    jp: "JP",
    nigeria: "NG",
    ng: "NG",
    southafrica: "ZA",
    za: "ZA",
    unitedarabemirates: "AE",
    uae: "AE",
    ae: "AE",
  };
  return countryMap[normalized] || raw.toUpperCase();
}

function normalizePrintifyStatus(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function mapPrintifyStatusToFulfillmentStatus(status: unknown, shipments: Array<Record<string, any>> = []) {
  const normalized = normalizePrintifyStatus(status);
  const deliveredShipments = shipments.filter(shipment => normalizePrintifyStatus(shipment.status).includes("delivered") || shipment.deliveredAt);
  if (shipments.length > 0 && deliveredShipments.length === shipments.length) return "Delivered";
  if (shipments.length > 1 && deliveredShipments.length > 0) return "Partially Shipped";
  if (shipments.length > 0) return "Shipped";
  if (!normalized) return "Printify Order Created";
  if (["created", "pending", "on_hold", "waiting_for_approval"].includes(normalized)) return "Printify Order Created";
  if (["approved", "in_production", "production", "sent_to_production", "printing"].includes(normalized)) return "Sent to Production";
  if (["fulfilled"].includes(normalized)) return "Shipped";
  if (["shipped", "partially_shipped", "in_transit", "out_for_delivery"].includes(normalized)) return "Shipped";
  if (["delivered", "completed"].includes(normalized)) return "Delivered";
  if (["cancelled", "canceled"].includes(normalized)) return "Cancelled";
  if (["failed", "error", "rejected"].includes(normalized)) return "Failed";
  return "Printify Order Created";
}

function customerStatusForFulfillment(status?: string | null) {
  const normalized = String(status || "").trim();
  if (["Paid", "Order Received", "Awaiting Fulfillment", "Ready for Printify Test", "Printify Order Created"].includes(normalized)) return "Order Received";
  if (normalized === "Awaiting Production Approval") return "Awaiting Production Approval";
  if (["Sent to Production", "In Production"].includes(normalized)) return "In Production";
  if (normalized === "Partially Shipped") return "Partially Shipped";
  if (normalized === "Shipped") return "Shipped";
  if (normalized === "Delivered") return "Delivered";
  if (normalized === "Cancelled") return "Cancelled";
  if (normalized === "Fulfillment Payment Issue") return "Fulfillment Payment Issue";
  if (["Requires Admin Review", "Failed"].includes(normalized)) return "Needs Review";
  return normalized || "Order Received";
}

function getPrintifyOrderStatus(payload: any) {
  return payload?.status || payload?.resource?.status || payload?.data?.status || payload?.order?.status || "";
}

function collectPrintifyShipmentCandidates(value: any, results: any[] = [], depth = 0) {
  if (!value || depth > 6) return results;
  if (Array.isArray(value)) {
    for (const item of value) collectPrintifyShipmentCandidates(item, results, depth + 1);
    return results;
  }
  if (typeof value !== "object") return results;
  const hasTracking = value.tracking_number || value.trackingNumber || value.tracking || value.number || value.tracking_code || value.trackingCode || value.tracking_numbers || value.trackingNumbers;
  const hasShipmentShape = hasTracking || value.tracking_url || value.trackingUrl || value.tracking_urls || value.trackingUrls || value.carrier || value.carrier_name || value.carrierName || value.shipping_carrier || value.shipped_at || value.delivered_at;
  if (hasShipmentShape) results.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") collectPrintifyShipmentCandidates(child, results, depth + 1);
  }
  return results;
}

function firstPrintifyValue(...values: any[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstPrintifyValue(...value);
      if (nested) return nested;
      continue;
    }
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function getPrintifyShipments(payload: any) {
  const seen = new Set<string>();
  return collectPrintifyShipmentCandidates(payload).map((shipment: any) => {
    const trackingNumber = firstPrintifyValue(shipment?.tracking_number, shipment?.trackingNumber, shipment?.tracking, shipment?.number, shipment?.tracking_code, shipment?.trackingCode, shipment?.tracking_numbers, shipment?.trackingNumbers);
    const printifyShipmentId = String(shipment?.id || shipment?.shipment_id || shipment?.shipmentId || trackingNumber || "").trim();
    return {
      printifyShipmentId,
      carrier: firstPrintifyValue(shipment?.carrier, shipment?.carrier_name, shipment?.carrierName, shipment?.shipping_carrier, shipment?.shippingCarrier, shipment?.carrier_code, shipment?.provider, shipment?.service),
      trackingNumber,
      trackingUrl: firstPrintifyValue(shipment?.tracking_url, shipment?.trackingUrl, shipment?.tracking_urls, shipment?.trackingUrls, shipment?.url, shipment?.tracking_link, shipment?.trackingLink),
      status: String(shipment?.status || shipment?.shipment_status || shipment?.shipmentStatus || "").trim(),
      shippedAt: shipment?.shipped_at || shipment?.shippedAt || shipment?.created_at || shipment?.createdAt || null,
      deliveredAt: shipment?.delivered_at || shipment?.deliveredAt || null,
      payload: shipment,
    };
  }).filter((shipment: any) => {
    const key = shipment.trackingNumber || shipment.printifyShipmentId;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function sendOrderMilestoneEmail(db: any, order: any, type: "production" | "shipping" | "delivery", subject: string, body: string) {
  if (!isEmailConfigured()) {
    await db.execute(sql`INSERT INTO order_notifications (orderId, notificationType, recipientEmail, subject, status, lastError) VALUES (${order.id}, ${type}, ${order.customerEmail}, ${subject}, 'skipped', 'Email provider is not configured') ON DUPLICATE KEY UPDATE status = status`).catch(() => undefined);
    return;
  }
  const [existing] = await db.execute(sql`SELECT id, status FROM order_notifications WHERE orderId = ${order.id} AND notificationType = ${type} AND recipientEmail = ${order.customerEmail} LIMIT 1`) as any;
  if (existing?.[0]?.status === "sent") return;
  try {
    await sendCustomerEmail({ to: order.customerEmail, subject, text: body, html: `<div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#f5f0e8;padding:28px"><h1>BUILD LEVEL</h1><p>${body}</p><p><a href="https://thebuildlevel.com/order/${order.orderToken}" style="display:inline-block;background:#c0392b;color:#fff;padding:12px 16px;text-decoration:none;border-radius:4px">View Order</a></p></div>` });
    await db.execute(sql`INSERT INTO order_notifications (orderId, notificationType, recipientEmail, subject, status, sentAt, attemptCount) VALUES (${order.id}, ${type}, ${order.customerEmail}, ${subject}, 'sent', NOW(), 1) ON DUPLICATE KEY UPDATE status = 'sent', sentAt = NOW(), attemptCount = attemptCount + 1`);
  } catch (error: any) {
    await db.execute(sql`INSERT INTO order_notifications (orderId, notificationType, recipientEmail, subject, status, lastError, attemptCount) VALUES (${order.id}, ${type}, ${order.customerEmail}, ${subject}, 'failed', ${error?.message || "Email failed"}, 1) ON DUPLICATE KEY UPDATE status = 'failed', lastError = VALUES(lastError), attemptCount = attemptCount + 1`).catch(() => undefined);
  }
}

function getPrintifyWebhookOrderId(payload: any) {
  return String(
    payload?.resource?.id ||
    payload?.resource?.order_id ||
    payload?.data?.id ||
    payload?.data?.order_id ||
    payload?.order?.id ||
    payload?.order_id ||
    "",
  ).trim();
}

async function updateInternalOrderFromPrintify(order: typeof orders.$inferSelect, data: any, eventType: string) {
  const db = await getDb();
  const printifyStatus = String(getPrintifyOrderStatus(data) || order.printifyStatus || "");
  const shipments = getPrintifyShipments(data);
  const fulfillmentStatus = mapPrintifyStatusToFulfillmentStatus(printifyStatus, shipments) as any;
  const customerStatus = customerStatusForFulfillment(fulfillmentStatus);
  const savedShipments: typeof shipments = [];
  for (const shipment of shipments) {
    try {
      await db.execute(sql`INSERT INTO order_shipments (orderId, printifyShipmentId, carrier, trackingNumber, trackingUrl, status, shippedAt, deliveredAt, payload) VALUES (${order.id}, ${shipment.printifyShipmentId || null}, ${shipment.carrier || null}, ${shipment.trackingNumber || shipment.printifyShipmentId}, ${shipment.trackingUrl || null}, ${shipment.status || null}, ${shipment.shippedAt ? new Date(shipment.shippedAt) : null}, ${shipment.deliveredAt ? new Date(shipment.deliveredAt) : null}, ${JSON.stringify(shipment.payload || {})}) ON DUPLICATE KEY UPDATE carrier = VALUES(carrier), trackingUrl = VALUES(trackingUrl), status = VALUES(status), deliveredAt = COALESCE(VALUES(deliveredAt), deliveredAt), payload = VALUES(payload), updatedAt = NOW()`);
      savedShipments.push(shipment);
    } catch (error: any) {
      await db.execute(sql`INSERT INTO order_alerts (orderId, alertType, message, status) VALUES (${order.id}, 'shipment_save_failed', ${error?.message || "Shipment tracking could not be saved"}, 'open') ON DUPLICATE KEY UPDATE message = VALUES(message)`).catch(() => undefined);
    }
  }
  await db.update(orders).set({
    printifyStatus,
    printifyApiResponse: data as any,
    fulfillmentStatus,
    customerStatus,
    lastSyncAt: new Date(),
    lastSyncError: null,
    updatedAt: new Date(),
  }).where(eq(orders.id, order.id));
  await db.insert(orderEvents).values({ orderId: order.id, eventType, payload: data as any, createdAt: new Date() });
  if (["Sent to Production", "In Production"].includes(fulfillmentStatus)) await sendOrderMilestoneEmail(db, order, "production", `Your Build Level Order Is in Production`, `Your order #${order.id} is now in production. We’ll email you again as soon as tracking becomes available.`);
  if (["Shipped", "Partially Shipped"].includes(fulfillmentStatus) && savedShipments.some(shipment => shipment.trackingNumber || shipment.trackingUrl)) await sendOrderMilestoneEmail(db, order, "shipping", `Your Build Level Order Has Shipped`, `Your order #${order.id} has shipped. Tracking: ${savedShipments.map(s => `${s.carrier} ${s.trackingNumber} ${s.trackingUrl}`).join(" | ")}`);
  if (fulfillmentStatus === "Delivered") await sendOrderMilestoneEmail(db, order, "delivery", `Your Build Level Order Was Delivered`, `Your Build Level order #${order.id} has been marked as delivered.`);
}

router.patch("/fulfillment/orders/:id/customer-shipping", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureFulfillmentTables();
    const id = Number(req.params.id);
    const data = z.object({
      customerName: z.string().max(255).optional().default(""),
      customerPhone: z.string().max(64).optional().default(""),
      line1: z.string().max(255).optional().default(""),
      line2: z.string().max(255).optional().default(""),
      city: z.string().max(128).optional().default(""),
      state: z.string().max(128).optional().default(""),
      postalCode: z.string().max(64).optional().default(""),
      country: z.string().max(64).optional().default(""),
    }).parse(req.body || {});
    const db = await getDb();
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    const address = {
      ...(order.shippingAddress as any || {}),
      name: data.customerName.trim(),
      displayName: data.customerName.trim(),
      phone: data.customerPhone.trim(),
      line1: data.line1.trim(),
      line2: data.line2.trim(),
      city: data.city.trim(),
      state: data.state.trim(),
      postal_code: data.postalCode.trim(),
      country: normalizeCountryForShipping(data.country),
      correctedByAdmin: true,
    };
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    const split = splitCustomerName(data.customerName);
    const reviewReasons: string[] = [];
    if (order.stripePaymentStatus !== "paid") reviewReasons.push(`Payment status is ${order.stripePaymentStatus || "unknown"}`);
    const addressError = validateAdminShippingAddress(address);
    if (addressError) reviewReasons.push(addressError);
    for (const item of items.filter(item => item.productType === "apparel")) {
      if (!item.printifyProductId) reviewReasons.push(`Missing Printify product ID for ${item.productName}`);
      if (!item.printifyVariantId) reviewReasons.push(`Missing Printify variant ID for ${item.productName}`);
    }
    const nextStatus = reviewReasons.length === 0 ? "Ready for Printify Test" : "Requires Admin Review";
    await db.update(orders).set({
      customerFirstName: split.firstName || null,
      customerLastName: split.lastName || null,
      customerName: data.customerName.trim() || null,
      customerPhone: data.customerPhone.trim() || null,
      shippingAddress: address,
      fulfillmentStatus: nextStatus as any,
      customerStatus: customerStatusForFulfillment(nextStatus),
      errorMessage: reviewReasons.length ? reviewReasons.join("; ") : null,
      processing: false,
      updatedAt: new Date(),
    }).where(eq(orders.id, id));
    await db.insert(orderEvents).values({ orderId: id, eventType: "admin.customer_shipping_updated", payload: { nextStatus, missing: reviewReasons, address } as any, createdAt: new Date() });
    const [updated] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    res.json({ success: true, order: updated, missing: reviewReasons });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/fulfillment/orders/:id/hold", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureFulfillmentTables();
    const id = Number(req.params.id);
    const db = await getDb();
    await db.update(orders).set({ fulfillmentStatus: "Requires Admin Review", errorMessage: "Held by admin", processing: false, updatedAt: new Date() }).where(eq(orders.id, id));
    await db.insert(orderEvents).values({ orderId: id, eventType: "admin.hold", payload: req.body || {}, createdAt: new Date() });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fulfillment/orders/:id/release", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureFulfillmentTables();
    const id = Number(req.params.id);
    const db = await getDb();
    await db.update(orders).set({ fulfillmentStatus: "Awaiting Fulfillment", errorMessage: null, processing: false, updatedAt: new Date() }).where(eq(orders.id, id));
    await db.insert(orderEvents).values({ orderId: id, eventType: "admin.release", payload: req.body || {}, createdAt: new Date() });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fulfillment/orders/:id/resolve", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureFulfillmentTables();
    const id = Number(req.params.id);
    const db = await getDb();
    await db.update(orders).set({ errorMessage: null, processing: false, updatedAt: new Date() }).where(eq(orders.id, id));
    await db.insert(orderEvents).values({ orderId: id, eventType: "admin.resolve", payload: req.body || {}, createdAt: new Date() });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fulfillment/orders/:id/refresh", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureFulfillmentTables();
    const id = Number(req.params.id);
    const db = await getDb();
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order?.printifyOrderId) { res.status(400).json({ error: "No Printify order ID to refresh" }); return; }
    const { shopId } = await getPrintifyCredentials();
    const data = await printifyRequest(`/shops/${shopId}/orders/${order.printifyOrderId}.json`);
    await updateInternalOrderFromPrintify(order, data, "printify.refresh");
    res.json({ success: true, data });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fulfillment/sync-open", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await ensureFulfillmentTables();
    const db = await getDb();
    const openOrders = await db.select().from(orders).where(sql`printifyOrderId IS NOT NULL AND fulfillmentStatus NOT IN ('Delivered','Cancelled','Failed')`).limit(50);
    const { shopId } = await getPrintifyCredentials();
    const results = [];
    for (const order of openOrders) {
      try {
        const data = await printifyRequest(`/shops/${shopId}/orders/${order.printifyOrderId}.json`);
        await updateInternalOrderFromPrintify(order, data, "printify.fallback_sync");
        results.push({ orderId: order.id, status: "synced", printifyOrderId: order.printifyOrderId });
      } catch (error: any) {
        await db.update(orders).set({ lastSyncFailedAt: new Date(), lastSyncError: error?.message || "Sync failed", updatedAt: new Date() }).where(eq(orders.id, order.id));
        await db.execute(sql`INSERT INTO order_alerts (orderId, alertType, message, status) VALUES (${order.id}, 'printify_sync_failed', ${error?.message || "Printify sync failed"}, 'open') ON DUPLICATE KEY UPDATE message = VALUES(message)`).catch(() => undefined);
        results.push({ orderId: order.id, status: "failed", error: error?.message || "Sync failed" });
      }
    }
    res.json({ success: true, checked: openOrders.length, results });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/fulfillment/orders/:id/retry", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureFulfillmentTables();
    const id = Number(req.params.id);
    const db = await getDb();
    await db.insert(orderEvents).values({ orderId: id, eventType: "admin.retry_requested", payload: req.body || {}, createdAt: new Date() });
    const result = await createPrintifyOrderFromInternalOrder(id);
    res.json({ success: true, result });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── Blog Posts ───────────────────────────────────────────────────────────────
router.get("/blog", requireAdmin, async (req: Request, res: Response) => {
  try {
    await publishDueScheduledBlogs();
    const db = await getDb();
    const rows = await db.select().from(blogPosts).orderBy(asc(blogPosts.sortOrder), asc(blogPosts.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

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

const scheduledAtSchema = z.union([z.string(), z.date(), z.null()]).optional();
function parseScheduledAt(value: z.infer<typeof scheduledAtSchema>) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid scheduled publish date");
  return date;
}

const blogSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  imageUrl: z.string().optional().nullable(),
  category: z.string().default("mindset"),
  readTime: z.string().optional(),
  published: z.boolean().default(false),
  scheduledAt: scheduledAtSchema,
  featured: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

router.post("/blog", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureBlogScheduleColumn();
    const data = blogSchema.parse(req.body);
    const scheduledAt = data.published ? null : parseScheduledAt(data.scheduledAt) ?? null;
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
      scheduledAt,
      featured: data.featured,
      sortOrder: data.sortOrder,
    });
    const [inserted] = await db.select({ id: blogPosts.id }).from(blogPosts).orderBy(asc(blogPosts.createdAt)).limit(1);
    res.json({ success: true, id: inserted?.id ?? 0 });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/blog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureBlogScheduleColumn();
    const id = parseInt(req.params.id as string);
    const data = blogSchema.partial().parse(req.body);
    const { scheduledAt: rawScheduledAt, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (rawScheduledAt !== undefined) updateData.scheduledAt = parseScheduledAt(rawScheduledAt);
    if (data.published === true && rawScheduledAt === undefined) updateData.scheduledAt = null;
    const db = await getDb();
    await db.update(blogPosts).set(updateData).where(eq(blogPosts.id, id));
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
    await publishDueScheduledDigitalProducts();
    const db = await getDb();
    const rows = await db.select().from(digitalProducts).orderBy(asc(digitalProducts.sortOrder), asc(digitalProducts.createdAt));
    const settings = await getSettingsMap();
    res.json(rows.map(row => ({
      ...row,
      downloadLimit: Number(settings[getDigitalLimitKey(row.id)] || process.env.DIGITAL_DOWNLOAD_LIMIT_DEFAULT || 5),
      accessExpiresDays: Number(settings[getDigitalExpiryDaysKey(row.id)] || process.env.DIGITAL_DOWNLOAD_EXPIRES_DAYS || 30),
    })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

const digitalSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  category: z.string().default("guide"),
  productType: z.enum(["pdf", "audiobook", "video", "other"]).default("pdf"),
  imageUrl: z.string().optional().nullable(),
  fileKey: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
  audioUrl: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  badge: z.string().optional().nullable(),
  stripePaymentLink: z.string().optional().nullable(),
  downloadLimit: z.number().int().positive().optional(),
  accessExpiresDays: z.number().int().positive().optional(),
  published: z.boolean().default(false),
  scheduledAt: scheduledAtSchema,
  sortOrder: z.number().default(0),
});

function getDigitalLimitKey(productId: number) {
  return `digital_product_${productId}_download_limit`;
}

function getDigitalExpiryDaysKey(productId: number) {
  return `digital_product_${productId}_expires_days`;
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

async function saveDigitalAccessSettings(productId: number, data: { downloadLimit?: number; accessExpiresDays?: number }) {
  if (data.downloadLimit !== undefined) await saveSetting(getDigitalLimitKey(productId), String(data.downloadLimit));
  if (data.accessExpiresDays !== undefined) await saveSetting(getDigitalExpiryDaysKey(productId), String(data.accessExpiresDays));
}

router.post("/digital", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureDigitalScheduleColumn();
    const data = digitalSchema.parse(req.body);
    const scheduledAt = data.published ? null : parseScheduledAt(data.scheduledAt) ?? null;
    const db = await getDb();
    await db.insert(digitalProducts).values({
      name: data.name,
      description: data.description,
      price: String(data.price),
      category: data.category,
      productType: data.productType,
      imageUrl: data.imageUrl,
      fileKey: data.fileKey,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      audioUrl: data.audioUrl,
      duration: data.duration,
      badge: data.badge,
      stripePaymentLink: data.stripePaymentLink,
      published: data.published,
      scheduledAt,
      sortOrder: data.sortOrder,
    });
    const [inserted] = await db.select({ id: digitalProducts.id }).from(digitalProducts).orderBy(desc(digitalProducts.createdAt)).limit(1);
    if (inserted?.id) await saveDigitalAccessSettings(inserted.id, data);
    res.json({ success: true, id: inserted?.id ?? 0 });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/digital/upload-config", requireAdmin, (req: Request, res: Response) => {
  res.json({
    maxDigitalFileSizeBytes: MAX_DIGITAL_FILE_SIZE_BYTES,
    allowedFileTypes: [],
    allowedThumbnailTypes: ALLOWED_IMAGE_EXTENSIONS,
    storage: {
      configured: isStorageConfigured(),
      provider: process.env.UPLOAD_ENDPOINT || process.env.R2_ENDPOINT ? "s3-compatible" : "s3",
    },
  });
});

router.post("/digital/upload", requireAdmin, upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const kind = req.body.kind === "thumbnail" ? "thumbnail" : "digital";
    const uploaded = await uploadObject(req.file, kind);
    res.json({ success: true, kind, ...uploaded });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put("/digital/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await ensureDigitalScheduleColumn();
    const id = parseInt(req.params.id as string);
    const data = digitalSchema.partial().parse(req.body);
    const db = await getDb();
    const { downloadLimit, accessExpiresDays, scheduledAt: rawScheduledAt, ...productData } = data;
    const updateData: Record<string, unknown> = { ...productData, updatedAt: new Date() };
    if (rawScheduledAt !== undefined) updateData.scheduledAt = parseScheduledAt(rawScheduledAt);
    if (data.published === true && rawScheduledAt === undefined) updateData.scheduledAt = null;
    if (data.price !== undefined) updateData.price = String(data.price);
    await db.update(digitalProducts).set(updateData).where(eq(digitalProducts.id, id));
    await saveDigitalAccessSettings(id, { downloadLimit, accessExpiresDays });
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

router.get("/maintenance", requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await getSettingsMap([
      "maintenance_enabled",
      "maintenance_title",
      "maintenance_message",
      "maintenance_return_text",
      "maintenance_contact_email",
    ]);
    res.json({
      enabled: settings.maintenance_enabled === "true",
      title: settings.maintenance_title || "Coming Back Soon",
      message: settings.maintenance_message || "BUILD LEVEL is upgrading the experience. The storefront will return shortly.",
      returnText: settings.maintenance_return_text || "Discipline. Focus. Execution.",
      contactEmail: settings.maintenance_contact_email || "info@thebuildlevel.com",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/maintenance", requireAdmin, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      enabled: z.boolean().default(false),
      title: z.string().min(1).max(160),
      message: z.string().min(1).max(1000),
      returnText: z.string().max(180).default(""),
      contactEmail: z.string().email().default("info@thebuildlevel.com"),
    });
    const data = schema.parse(req.body);
    await saveSetting("maintenance_enabled", String(data.enabled));
    await saveSetting("maintenance_title", data.title);
    await saveSetting("maintenance_message", data.message);
    await saveSetting("maintenance_return_text", data.returnText);
    await saveSetting("maintenance_contact_email", data.contactEmail);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─── Integration Management ───────────────────────────────────────────────────
router.get("/integrations/overview", requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await getSettingsMap(integrationSettingKeys);
    const shopifyDisabled = settings.shopify_disabled === "true";
    const printifyDisabled = settings.printify_disabled === "true";
    const stripeDisabled = settings.stripe_disabled === "true";
    const tidioDisabled = settings.tidio_disabled === "true";
    const { storeUrl, apiKey: shopifyApiKey } = await getShopifyCredentials();
    const { apiKey: printifyApiKey, shopId: printifyShopId } = await getPrintifyCredentials();
    const stripeConfigured = !stripeDisabled && !!process.env.STRIPE_SECRET_KEY;
    const stripeWebhookConfigured = !!process.env.STRIPE_WEBHOOK_SECRET;

    res.json({
      generatedAt: new Date().toISOString(),
      integrations: {
        shopify: {
          connected: !!(storeUrl && shopifyApiKey),
          disabled: shopifyDisabled,
          storeUrl,
          token: maskSecret(shopifyApiKey),
          capabilities: ["products", "inventory", "orders", "customers", "webhooks"],
        },
        printify: {
          connected: !!(printifyApiKey && printifyShopId),
          disabled: printifyDisabled,
          shopId: printifyShopId,
          token: maskSecret(printifyApiKey),
          capabilities: ["publishing", "fulfillment", "orders", "inventory"],
        },
        stripe: {
          connected: stripeConfigured,
          disabled: stripeDisabled,
          webhookConfigured: stripeWebhookConfigured,
          key: maskSecret(process.env.STRIPE_SECRET_KEY),
          capabilities: ["payments", "transactions", "webhooks", "financial reporting"],
        },
        tidio: {
          enabled: !tidioDisabled && settings.tidio_enabled === "true",
          disabled: tidioDisabled,
          configured: !tidioDisabled && !!normalizeTidioPublicKey(settingOrEnv(settings, "tidio_public_key", process.env.TIDIO_PUBLIC_KEY)),
          publicKey: tidioDisabled ? "" : maskSecret(normalizeTidioPublicKey(settingOrEnv(settings, "tidio_public_key", process.env.TIDIO_PUBLIC_KEY))),
          capabilities: ["chat controls", "chatbot settings", "support analytics"],
        },
        social: SOCIAL_PLATFORMS.map((platform) => ({
          platform,
          enabled: settings[`social_${platform}_enabled`] === "true",
          handle: settings[`social_${platform}_handle`] || "",
          url: settings[`social_${platform}_url`] || "",
          analyticsEnabled: settings[`social_${platform}_analytics_enabled`] === "true",
          oauth: socialEnvStatus(platform),
        })),
      },
      automation: {
        socialSchedulerEnabled: settings.social_scheduler_enabled === "true",
        campaignName: settings.social_campaign_name || "",
        socialSharingEnabled: settings.social_sharing_enabled === "true",
      },
      system: {
        cloudflarePagesCompatible: true,
        renderApiCompatible: true,
        railwayDatabaseCompatible: true,
        publicStorefrontExposure: false,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/integrations/stripe/dashboard", requireAdmin, async (req: Request, res: Response) => {
  try {
    if (await isIntegrationDisabled("stripe")) {
      res.json({ connected: false, disabled: true, payments: [], sessions: [], message: "Stripe is disconnected" });
      return;
    }
    const stripe = getStripeClient();
    if (!stripe) {
      res.json({
        connected: false,
        balance: null,
        payments: [],
        sessions: [],
        message: "STRIPE_SECRET_KEY is not configured",
      });
      return;
    }

    const [balance, payments, sessions] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.paymentIntents.list({ limit: 10 }),
      stripe.checkout.sessions.list({ limit: 10 }),
    ]);

    res.json({
      connected: true,
      webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
      balance,
      payments: payments.data.map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        created: payment.created,
        customer: payment.customer,
      })),
      sessions: sessions.data.map((session) => ({
        id: session.id,
        amountTotal: session.amount_total,
        currency: session.currency,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_details?.email || session.customer_email,
        created: session.created,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/integrations/tidio/config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await getSettingsMap(integrationSettingKeys);
    const disabled = settings.tidio_disabled === "true";
    const publicKey = settingOrEnv(settings, "tidio_public_key", process.env.TIDIO_PUBLIC_KEY);
    res.json({
      enabled: !disabled && settings.tidio_enabled === "true",
      publicKey: disabled ? "" : normalizeTidioPublicKey(publicKey),
      chatControls: settings.tidio_chat_controls || "manual",
      chatbotSettings: settings.tidio_chatbot_settings || "",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/integrations/tidio/config", requireAdmin, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      enabled: z.boolean().default(false),
      publicKey: z.string().optional().default(""),
      chatControls: z.string().optional().default("manual"),
      chatbotSettings: z.string().optional().default(""),
    });
    const data = schema.parse(req.body);
    await saveSetting("tidio_disabled", "false");
    await saveSetting("tidio_enabled", String(data.enabled));
    await saveSetting("tidio_public_key", normalizeTidioPublicKey(data.publicKey));
    await saveSetting("tidio_chat_controls", data.chatControls);
    await saveSetting("tidio_chatbot_settings", data.chatbotSettings);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/integrations/social/settings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await getSettingsMap(integrationSettingKeys);
    res.json({
      schedulerEnabled: settings.social_scheduler_enabled === "true",
      campaignName: settings.social_campaign_name || "",
      socialSharingEnabled: settings.social_sharing_enabled === "true",
      platforms: SOCIAL_PLATFORMS.map((platform) => ({
        platform,
        enabled: settings[`social_${platform}_enabled`] === "true",
        handle: settings[`social_${platform}_handle`] || "",
        url: settings[`social_${platform}_url`] || "",
        analyticsEnabled: settings[`social_${platform}_analytics_enabled`] === "true",
        oauth: socialEnvStatus(platform),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/integrations/social/settings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      schedulerEnabled: z.boolean().default(false),
      campaignName: z.string().optional().default(""),
      socialSharingEnabled: z.boolean().default(false),
      platforms: z.array(z.object({
        platform: z.enum(SOCIAL_PLATFORMS),
        enabled: z.boolean().default(false),
        handle: z.string().optional().default(""),
        url: z.string().optional().default(""),
        analyticsEnabled: z.boolean().default(false),
      })).default([]),
    });
    const data = schema.parse(req.body);
    await saveSetting("social_scheduler_enabled", String(data.schedulerEnabled));
    await saveSetting("social_campaign_name", data.campaignName);
    await saveSetting("social_sharing_enabled", String(data.socialSharingEnabled));
    for (const platform of data.platforms) {
      await saveSetting(`social_${platform.platform}_enabled`, String(platform.enabled));
      await saveSetting(`social_${platform.platform}_handle`, platform.handle);
      await saveSetting(`social_${platform.platform}_url`, platform.url);
      await saveSetting(`social_${platform.platform}_analytics_enabled`, String(platform.analyticsEnabled));
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/integrations/social/oauth/:platform", requireAdmin, async (req: Request, res: Response) => {
  try {
    const platform = req.params.platform as SocialPlatform;
    if (!SOCIAL_PLATFORMS.includes(platform)) {
      res.status(404).json({ error: "Unsupported platform" });
      return;
    }

    const env = socialEnvStatus(platform);
    res.json({
      platform,
      configured: env.clientIdConfigured && env.clientSecretConfigured,
      setupRequired: !(env.clientIdConfigured && env.clientSecretConfigured),
      message: env.clientIdConfigured && env.clientSecretConfigured
        ? "OAuth credentials are configured. Add provider-specific redirect URL handling before connecting live accounts."
        : "Set provider CLIENT_ID and CLIENT_SECRET environment variables before connecting this account.",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/integrations/test/:provider", requireAdmin, async (req: Request, res: Response) => {
  try {
    const provider = String(req.params.provider || "");
    if (await isIntegrationDisabled(provider)) {
      res.json({ ok: false, message: `${provider} is disconnected` });
      return;
    }
    if (provider === "shopify") {
      const { storeUrl, apiKey } = await getShopifyCredentials();
      if (!storeUrl || !apiKey) { res.json({ ok: false, message: "Shopify credentials not configured" }); return; }
      const url = storeUrl.startsWith("http") ? storeUrl : `https://${storeUrl}`;
      const response = await fetch(`${url}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
        headers: { "X-Shopify-Access-Token": apiKey },
      });
      res.json({ ok: response.ok, status: response.status, message: response.ok ? "Shopify connected" : "Shopify connection failed" });
      return;
    }
    if (provider === "printify") {
      const { apiKey } = await getPrintifyCredentials();
      if (!apiKey) { res.json({ ok: false, message: "Printify API key not configured" }); return; }
      const response = await fetch("https://api.printify.com/v1/shops.json", {
        headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "BuildLevelWebsite/1.0" },
      });
      const data = await response.json().catch(() => ({}));
      const message = response.ok
        ? "Printify connected"
        : response.status === 401
          ? "Printify rejected the API token. Paste the full token from Printify Account Settings > API Tokens."
          : (typeof data?.message === "string" ? data.message : "Printify connection failed");
      res.json({ ok: response.ok, status: response.status, message });
      return;
    }
    if (provider === "stripe") {
      const stripe = getStripeClient();
      if (!stripe) { res.json({ ok: false, message: "STRIPE_SECRET_KEY not configured" }); return; }
      await stripe.balance.retrieve();
      res.json({ ok: true, message: "Stripe connected" });
      return;
    }
    if (provider === "tidio") {
      const settings = await getSettingsMap(["tidio_public_key"]);
      const publicKey = normalizeTidioPublicKey(settingOrEnv(settings, "tidio_public_key", process.env.TIDIO_PUBLIC_KEY));
      res.json({ ok: !!publicKey, message: publicKey ? "Tidio public key configured" : "Tidio public key missing" });
      return;
    }
    res.status(404).json({ error: "Unsupported provider" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/integrations/disconnect/:provider", requireAdmin, async (req: Request, res: Response) => {
  try {
    const provider = String(req.params.provider || "");
    if (provider === "shopify") {
      await saveSetting("shopify_disabled", "true");
      await saveSetting("shopify_store_url", "");
      await saveSetting("shopify_api_key", "");
      res.json({ success: true, provider, disabled: true });
      return;
    }
    if (provider === "printify") {
      await saveSetting("printify_disabled", "true");
      await saveSetting("printify_api_key", "");
      await saveSetting("printify_shop_id", "");
      res.json({ success: true, provider, disabled: true });
      return;
    }
    if (provider === "stripe") {
      await saveSetting("stripe_disabled", "true");
      res.json({ success: true, provider, disabled: true });
      return;
    }
    if (provider === "tidio") {
      await saveSetting("tidio_disabled", "true");
      await saveSetting("tidio_enabled", "false");
      await saveSetting("tidio_public_key", "");
      res.json({ success: true, provider, disabled: true });
      return;
    }
    if (provider === "social") {
      await saveSetting("social_scheduler_enabled", "false");
      await saveSetting("social_sharing_enabled", "false");
      for (const platform of SOCIAL_PLATFORMS) await saveSetting(`social_${platform}_enabled`, "false");
      res.json({ success: true, provider, disabled: true });
      return;
    }
    res.status(404).json({ error: "Unsupported provider" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/integrations/enable/:provider", requireAdmin, async (req: Request, res: Response) => {
  try {
    const provider = String(req.params.provider || "");
    if (provider === "shopify" || provider === "printify" || provider === "tidio") {
      res.status(400).json({ error: `${provider} must be reconnected by entering fresh credentials` });
      return;
    }
    if (provider !== "stripe") {
      res.status(404).json({ error: "Unsupported provider" });
      return;
    }
    await saveSetting(`${provider}_disabled`, "false");
    res.json({ success: true, provider, disabled: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Printify Proxy ───────────────────────────────────────────────────────────
// Proxies requests to Printify API using stored credentials
async function getPrintifyCredentials() {
  if (await isIntegrationDisabled("printify")) return { apiKey: "", shopId: "" };
  const db = await getDb();
  const rows = await db.select().from(siteSettings)
    .where(eq(siteSettings.key, 'printify_api_key'));
  const shopRows = await db.select().from(siteSettings)
    .where(eq(siteSettings.key, 'printify_shop_id'));
  return {
    apiKey: (rows[0]?.value || process.env.PRINTIFY_API_KEY || '').trim(),
    shopId: (shopRows[0]?.value || process.env.PRINTIFY_SHOP_ID || '').trim(),
  };
}

async function printifyRequest(path: string) {
  const { apiKey } = await getPrintifyCredentials();
  if (!apiKey) throw new Error("Printify API key not configured");
  const response = await fetch(`https://api.printify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "BuildLevelWebsite/1.0" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : JSON.stringify(data).slice(0, 300);
    if (response.status === 401) {
      throw new Error("Printify rejected the API token (401 Unauthenticated). Paste the full token from Printify Account Settings > API Tokens, not the Shop ID, API URL, or OAuth client secret.");
    }
    throw new Error(`Printify API error ${response.status}: ${message}`);
  }
  return data;
}

async function printifyRequestWithBody(path: string, method: string, body?: unknown) {
  const { apiKey } = await getPrintifyCredentials();
  if (!apiKey) throw new Error("Printify API key not configured");
  const response = await fetch(`https://api.printify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "User-Agent": "BuildLevelWebsite/1.0" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : JSON.stringify(data).slice(0, 300);
    if (response.status === 401) {
      throw new Error("Printify rejected the API token (401 Unauthenticated). Paste the full token from Printify Account Settings > API Tokens.");
    }
    throw new Error(`Printify API error ${response.status}: ${message}`);
  }
  return data;
}

async function notifyPrintifyPublishingStatus(printifyProductId: string, status: "success" | "error", reason?: string) {
  const endpoint = status === "success" ? "publishing_succeeded" : "publishing_failed";
  try {
    const body = status === "error" && reason ? { reason: reason.slice(0, 500) } : undefined;
    await printifyRequestWithBody(`/shops/${(await getPrintifyCredentials()).shopId}/products/${printifyProductId}/${endpoint}.json`, "POST", body);
    return { ok: true, status };
  } catch (error: any) {
    console.error(`[Printify] Failed to notify publishing ${status}:`, error);
    return { ok: false, status, error: error?.message || "Printify publish notification failed" };
  }
}

async function validatePrintifyCredentials(apiKey: string, shopId: string) {
  const response = await fetch("https://api.printify.com/v1/shops.json", {
    headers: { Authorization: `Bearer ${apiKey}`, "User-Agent": "BuildLevelWebsite/1.0" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Printify rejected this API token (401 Unauthenticated). Generate/copy the full Printify API token from Account Settings > API Tokens and paste it into API Token.");
    }
    const message = typeof data?.message === "string" ? data.message : JSON.stringify(data).slice(0, 300);
    throw new Error(`Printify credential test failed (${response.status}): ${message}`);
  }

  const shops = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.shops) ? data.shops : [];
  if (shops.length > 0 && !shops.some((shop: any) => String(shop?.id) === shopId)) {
    throw new Error(`Printify API token works, but Shop ID ${shopId} was not found for this token. Use a Shop ID from the same Printify account/API store.`);
  }
}

function getPrintifyProductId(product: any) {
  return String(product?.id || "").trim();
}

function getPrintifyVariants(product: any) {
  return Array.isArray(product?.variants) ? product.variants : [];
}

function isPrintifyProductVisible(product: any) {
  return product?.visible === true;
}

function getPrintifySizes(product: any) {
  const sizes: string[] = getPrintifyVariants(product)
    .filter((variant: any) => variant?.is_enabled !== false)
    .map((variant: any) => JSON.stringify({
      label: String(variant.title || "").trim(),
      variantId: String(variant.id || "").trim(),
      price: (Number(variant.price || 0) / 100).toFixed(2),
    }))
    .filter(Boolean);
  return Array.from(new Set<string>(sizes)).slice(0, 24);
}

async function syncPrintifyVariants(productId: number, product: any) {
  await ensureFulfillmentTables();
  const db = await getDb();
  const printifyProductId = getPrintifyProductId(product);
  const variants = getPrintifyVariants(product).filter((variant: any) => variant?.is_enabled !== false);
  for (const variant of variants) {
    const label = String(variant.title || "").trim() || `Variant ${variant.id}`;
    const parts = label.split("/").map(part => part.trim());
    const color = parts.length > 1 ? parts[0] : undefined;
    const size = parts.length > 1 ? parts[parts.length - 1] : label;
    const price = (Number(variant.price || 0) / 100).toFixed(2);
    const existing = await db.select().from(productVariants).where(eq(productVariants.printifyVariantId, String(variant.id))).limit(1);
    const values = {
      productId,
      source: "printify" as const,
      printifyProductId,
      printifyVariantId: String(variant.id),
      label,
      size,
      color,
      price,
      available: variant?.is_available !== false,
      enabled: variant?.is_enabled !== false,
      printProviderId: product?.print_provider_id ? String(product.print_provider_id) : null,
      blueprintId: product?.blueprint_id ? String(product.blueprint_id) : null,
      imageUrl: product?.images?.[0]?.src || null,
      updatedAt: new Date(),
    };
    if (existing.length > 0) await db.update(productVariants).set(values).where(eq(productVariants.id, existing[0].id));
    else await db.insert(productVariants).values(values);
  }
}

function getPrintifyPrice(product: any) {
  const variants = getPrintifyVariants(product);
  const activePrices = variants
    .filter((variant: any) => variant?.is_enabled !== false && Number(variant.price || 0) > 0)
    .map((variant: any) => Number(variant.price || 0));
  const cents = activePrices.length ? Math.min(...activePrices) : Number(variants[0]?.price || 0);
  return cents ? (cents / 100).toFixed(2) : "29.99";
}

function getPrintifyInStock(product: any) {
  return getPrintifyVariants(product).some((variant: any) => variant?.is_enabled !== false && variant?.is_available !== false);
}

function getPrintifyImageUrls(product: any) {
  const urls = (Array.isArray(product?.images) ? product.images : [])
    .map((image: any) => String(image?.src || "").trim())
    .filter((url: string) => /^https?:\/\//i.test(url));
  return Array.from(new Set<string>(urls)).slice(0, 24);
}

function serializeProductImages(urls: string[]) {
  if (urls.length <= 1) return urls[0] || "";
  return JSON.stringify(urls);
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
          if (label) repaired.push(JSON.stringify({
            label,
            variantId: parsed?.variantId ? String(parsed.variantId) : undefined,
            price: parsed?.price ? String(parsed.price) : undefined,
          }));
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
        if (label) repaired.push(JSON.stringify({
          label,
          variantId: parsed?.variantId ? String(parsed.variantId) : undefined,
          price: parsed?.price ? String(parsed.price) : undefined,
        }));
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

async function syncPrintifyProductToStore(printifyProductOrId: string | Record<string, any>) {
  const { shopId } = await getPrintifyCredentials();
  if (!shopId) throw new Error("Printify shop ID not configured");
  const product = typeof printifyProductOrId === "string"
    ? await printifyRequest(`/shops/${shopId}/products/${printifyProductOrId}.json`)
    : printifyProductOrId;
  const printifyProductId = getPrintifyProductId(product);
  if (!printifyProductId) throw new Error("Printify product is missing an ID");
  const visible = isPrintifyProductVisible(product);
  const price = getPrintifyPrice(product);
  const imageUrl = serializeProductImages(getPrintifyImageUrls(product));
  const sizes = getPrintifySizes(product);
  const db = await getDb();
  const existing = await db.select().from(products).where(eq(products.printifyProductId, printifyProductId)).limit(1);
  const existingProduct = existing[0];
  const values = {
    name: product.title || "Printify Product",
    description: cleanPrintifyDescription(product.description),
    price: existingProduct?.price ? String(existingProduct.price) : price,
    category: existingProduct?.category || "unclassified",
    sizes: sizes.length ? sizes : ["S", "M", "L", "XL"],
    imageUrl,
    badge: existingProduct?.badge || "",
    inStock: existingProduct ? existingProduct.inStock : false,
    published: existingProduct ? existingProduct.published : false,
    hidden: existingProduct ? existingProduct.hidden : true,
    delisted: existingProduct ? existingProduct.delisted : false,
    featured: existingProduct?.featured ?? false,
    sortOrder: existingProduct?.sortOrder ?? 0,
    printifyProductId,
    updatedAt: new Date(),
  };
  if (existing.length > 0) {
    await db.update(products).set(values).where(eq(products.printifyProductId, printifyProductId));
    await syncPrintifyVariants(existing[0].id, product);
    return { productId: existing[0].id, printifyProductId, action: visible ? "updated" : "hidden" };
  }
  await db.insert(products).values(values);
  const [created] = await db.select({ id: products.id }).from(products).where(eq(products.printifyProductId, printifyProductId)).limit(1);
  if (created?.id) await syncPrintifyVariants(created.id, product);
  return { productId: created?.id ?? 0, printifyProductId, action: visible ? "created" : "hidden" };
}

async function fetchAllPrintifyProducts() {
  const { shopId } = await getPrintifyCredentials();
  if (!shopId) throw new Error("Printify shop ID not configured");
  const allProducts: any[] = [];
  let page = 1;
  let lastPage = 1;
  let nextPageUrl = "";
  do {
    const data = await printifyRequest(`/shops/${shopId}/products.json?page=${page}&limit=50`);
    const pageProducts = Array.isArray(data?.data) ? data.data : [];
    allProducts.push(...pageProducts);
    lastPage = Number(data?.last_page || data?.lastPage || page);
    nextPageUrl = String(data?.next_page_url || data?.nextPageUrl || "");
    page += 1;
  } while ((nextPageUrl || page <= lastPage) && page <= 100);
  return allProducts;
}

async function syncPrintifyStoreToWebsite() {
  const db = await getDb();
  const listProducts = await fetchAllPrintifyProducts();
  const { shopId } = await getPrintifyCredentials();
  const syncedProductIds = new Set<string>();
  const results: Array<{ productId: number; printifyProductId: string; action: string }> = [];

  for (const listProduct of listProducts) {
    const printifyProductId = getPrintifyProductId(listProduct);
    if (!printifyProductId) continue;
    syncedProductIds.add(printifyProductId);
    const detailProduct = await printifyRequest(`/shops/${shopId}/products/${printifyProductId}.json`);
    results.push(await syncPrintifyProductToStore(detailProduct));
  }

  const localPrintifyProducts = await db.select().from(products);
  let delisted = 0;
  for (const localProduct of localPrintifyProducts) {
    if (!localProduct.printifyProductId || syncedProductIds.has(localProduct.printifyProductId)) continue;
    await db.update(products).set({
      published: false,
      hidden: true,
      delisted: true,
      inStock: false,
      badge: "Removed from Printify",
      updatedAt: new Date(),
    }).where(eq(products.id, localProduct.id));
    delisted += 1;
  }

  const summary = results.reduce<Record<string, number>>((totals, result) => {
    totals[result.action] = (totals[result.action] || 0) + 1;
    return totals;
  }, {});

  return {
    products: listProducts,
    results,
    summary: {
      totalPrintifyProducts: listProducts.length,
      visiblePrintifyProducts: listProducts.filter(isPrintifyProductVisible).length,
      created: summary.created || 0,
      updated: summary.updated || 0,
      hidden: summary.hidden || 0,
      delisted,
    },
  };
}

async function delistPrintifyProduct(printifyProductId: string) {
  const db = await getDb();
  const existing = await db.select().from(products).where(eq(products.printifyProductId, printifyProductId)).limit(1);
  if (existing.length === 0) return { productId: 0, printifyProductId, action: "ignored" };
  await db.update(products).set({
    published: false,
    hidden: true,
    delisted: true,
    inStock: false,
    badge: "Removed from Printify",
    updatedAt: new Date(),
  }).where(eq(products.printifyProductId, printifyProductId));
  return { productId: existing[0].id, printifyProductId, action: "delisted" };
}

function getPrintifyWebhookSecret() {
  return (process.env.PRINTIFY_WEBHOOK_SECRET || process.env.PRINTIFY_SYNC_SECRET || "").trim();
}

function isPrintifyWebhookAuthorized(req: Request) {
  const expected = getPrintifyWebhookSecret();
  if (!expected) return true;
  const hmacHeader = String(req.headers["x-printify-hmac-sha256"] || req.headers["x-printify-hmac"] || "").trim();
  if (hmacHeader) {
    const rawBody = (req as any).rawBody;
    const computed = crypto.createHmac("sha256", expected).update(rawBody || JSON.stringify(req.body || {})).digest("hex");
    const provided = hmacHeader.replace(/^sha256=/i, "");
    try {
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(provided));
    } catch {
      return false;
    }
  }
  const provided = String(req.query.secret || req.headers["x-printify-webhook-secret"] || req.headers["x-printify-signature"] || "").trim();
  return provided === expected;
}

function getPrintifyWebhookProductId(payload: any) {
  return String(
    payload?.resource?.id ||
    payload?.resource?.product_id ||
    payload?.data?.id ||
    payload?.data?.product_id ||
    payload?.product?.id ||
    payload?.product_id ||
    payload?.id ||
    "",
  ).trim();
}

function getPrintifyWebhookTopic(req: Request, payload: any) {
  return String(
    payload?.topic ||
    payload?.type ||
    payload?.event ||
    req.headers["x-printify-topic"] ||
    "",
  ).trim();
}

function getBackendWebhookBaseUrl(req: Request) {
  const configured = process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
  if (configured) return configured.replace(/\/$/, "");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}`;
}

function isPrintifyAutoSyncAuthorized(req: Request) {
  const expectedSecret = (process.env.PRINTIFY_SYNC_SECRET || "").trim();
  const providedSecret = String(req.query.secret || req.headers["x-printify-sync-secret"] || "").trim();
  return !!expectedSecret && providedSecret === expectedSecret;
}

router.get("/printify/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, shopId } = await getPrintifyCredentials();
    res.json({ connected: !!(apiKey && shopId), shopId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/printify/credentials", requireAdmin, async (req: Request, res: Response) => {
  try {
    const apiKey = String(req.body.apiKey || "").trim();
    const shopId = String(req.body.shopId || "").trim();
    if (!apiKey || isLikelyUrl(apiKey)) {
      res.status(400).json({ error: "Use your Printify API token, not the API address" });
      return;
    }
    if (!shopId) {
      res.status(400).json({ error: "Printify Shop ID is required" });
      return;
    }
    await validatePrintifyCredentials(apiKey, shopId);
    await saveSetting("printify_disabled", "false");
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
    const data = await fetchAllPrintifyProducts();
    res.json({
      data,
      loaded: data.length,
      total: data.length,
      summary: {
        loadedProducts: data.length,
        totalPrintifyProducts: data.length,
        progress: "complete",
        errors: [],
      },
    });
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

router.get("/printify/inventory", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, shopId } = await getPrintifyCredentials();
    if (!apiKey || !shopId) { res.status(400).json({ error: 'Printify not configured' }); return; }
    const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json?page=1&limit=20`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await r.json();
    const productsList = Array.isArray(data?.data) ? data.data : [];
    res.json({
      products: productsList.map((product: any) => ({
        id: product.id,
        title: product.title,
        visible: product.visible,
        variants: (product.variants || []).map((variant: any) => ({
          id: variant.id,
          title: variant.title,
          enabled: variant.is_enabled,
          inStock: variant.is_available,
        })),
      })),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/printify/publish", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { printifyProductId } = req.body;
    const { apiKey, shopId } = await getPrintifyCredentials();
    if (!apiKey || !shopId) { res.status(400).json({ error: 'Printify not configured' }); return; }
    if (!printifyProductId) { res.status(400).json({ error: 'printifyProductId is required' }); return; }
    const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/products/${printifyProductId}/publish.json`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: true,
        description: true,
        images: true,
        variants: true,
        tags: true,
        keyFeatures: true,
        shipping_template: true,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      res.status(r.status).json({ success: false, data });
      return;
    }
    try {
      const storeProduct = await syncPrintifyProductToStore(printifyProductId);
      const publishStatus = await notifyPrintifyPublishingStatus(printifyProductId, "success");
      res.json({ success: true, data, storeProduct, publishStatus });
    } catch (syncError: any) {
      const publishStatus = await notifyPrintifyPublishingStatus(printifyProductId, "error", syncError.message);
      res.status(500).json({ error: syncError.message, publishStatus });
    }
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/printify/sync", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, shopId } = await getPrintifyCredentials();
    if (!apiKey || !shopId) { res.status(400).json({ error: 'Printify not configured' }); return; }
    const syncResult = await syncPrintifyStoreToWebsite();
    let ordersData: any = { data: [] };
    let ordersError = "";
    try {
      ordersData = await printifyRequest(`/shops/${shopId}/orders.json?page=1&limit=20`);
    } catch (error: any) {
      ordersError = error?.message || "Printify orders could not be loaded";
    }
    res.json({
      success: true,
      products: { data: syncResult.products },
      orders: ordersData,
      ordersError,
      summary: {
        ...syncResult.summary,
        orders: ordersData?.data?.length ?? 0,
      },
      results: syncResult.results,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/printify/webhooks/setup", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { shopId } = await getPrintifyCredentials();
    if (!shopId) { res.status(400).json({ error: "Printify shop ID not configured" }); return; }
    const secret = getPrintifyWebhookSecret();
    if (!secret) {
      res.status(400).json({ error: "Set PRINTIFY_WEBHOOK_SECRET or PRINTIFY_SYNC_SECRET in Render before installing webhooks" });
      return;
    }
    const webhookUrl = `${getBackendWebhookBaseUrl(req)}/api/admin/printify/webhook?secret=${encodeURIComponent(secret)}`;
    const topics = [
      "product:publish:started",
      "product:publish:succeeded",
      "product:updated",
      "product:deleted",
      "order:created",
      "order:updated",
      "order:sent-to-production",
      "order:shipment:created",
      "order:delivered",
      "order:cancelled",
    ];
    const existingData = await printifyRequest(`/shops/${shopId}/webhooks.json`).catch(() => ({}));
    const existing = Array.isArray(existingData?.data) ? existingData.data : Array.isArray(existingData) ? existingData : [];
    const results = [];

    for (const topic of topics) {
      const alreadyInstalled = existing.some((webhook: any) => webhook?.topic === topic && webhook?.url === webhookUrl);
      if (alreadyInstalled) {
        results.push({ topic, status: "already-installed" });
        continue;
      }
      try {
        const created = await printifyRequestWithBody(`/shops/${shopId}/webhooks.json`, "POST", { topic, url: webhookUrl, secret });
        results.push({ topic, status: "installed", id: created?.id });
      } catch (error: any) {
        results.push({ topic, status: "failed", error: error?.message || "Webhook install failed" });
      }
    }

    res.json({ success: results.some(result => result.status === "installed" || result.status === "already-installed"), webhookUrl, results });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/printify/webhook", async (req: Request, res: Response) => {
  try {
    if (!isPrintifyWebhookAuthorized(req)) {
      res.status(401).json({ error: "Invalid Printify webhook secret" });
      return;
    }
    const payload = req.body || {};
    const topic = getPrintifyWebhookTopic(req, payload);
    const printifyProductId = getPrintifyWebhookProductId(payload);
    const printifyOrderId = getPrintifyWebhookOrderId(payload);
    let result: unknown;

    if ((topic.includes("order") || printifyOrderId) && printifyOrderId) {
      const db = await getDb();
      const [order] = await db.select().from(orders).where(eq(orders.printifyOrderId, printifyOrderId)).limit(1);
      if (order) {
        await updateInternalOrderFromPrintify(order, payload, "printify.webhook");
        result = { orderId: order.id, printifyOrderId, status: getPrintifyOrderStatus(payload) };
      } else {
        result = { printifyOrderId, ignored: "No matching internal order" };
      }
    } else if (topic.includes("deleted") && printifyProductId) {
      result = await delistPrintifyProduct(printifyProductId);
    } else if (printifyProductId) {
      result = await syncPrintifyProductToStore(printifyProductId);
      if (topic.includes("publish")) {
        await notifyPrintifyPublishingStatus(printifyProductId, "success");
      }
    } else {
      result = await syncPrintifyStoreToWebsite();
    }

    res.json({ success: true, topic, printifyProductId, printifyOrderId, result });
  } catch (e: any) {
    const payload = req.body || {};
    const topic = getPrintifyWebhookTopic(req, payload);
    const printifyProductId = getPrintifyWebhookProductId(payload);
    if (topic.includes("publish") && printifyProductId) {
      await notifyPrintifyPublishingStatus(printifyProductId, "error", e.message);
    }
    console.error("[Printify Webhook] Failed:", e);
    res.status(500).json({ error: e.message });
  }
});

router.all("/printify/auto-sync", async (req: Request, res: Response) => {
  try {
    if (!isPrintifyAutoSyncAuthorized(req)) {
      res.status(401).json({ error: "Printify auto-sync secret is missing or invalid" });
      return;
    }
    const { apiKey, shopId } = await getPrintifyCredentials();
    if (!apiKey || !shopId) { res.status(400).json({ error: "Printify not configured" }); return; }
    const syncResult = await syncPrintifyStoreToWebsite();
    res.json({ success: true, summary: syncResult.summary, results: syncResult.results });
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
  if (await isIntegrationDisabled("shopify")) return { storeUrl: "", apiKey: "" };
  const db = await getDb();
  const urlRows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'shopify_store_url'));
  const keyRows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'shopify_api_key'));
  return {
    storeUrl: urlRows[0]?.value || process.env.SHOPIFY_STORE_URL || '',
    apiKey: keyRows[0]?.value || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_API_KEY || '',
  };
}

function normalizeShopifyUrl(storeUrl: string) {
  return storeUrl.startsWith('http') ? storeUrl : `https://${storeUrl}`;
}

async function shopifyRequest(path: string, method = "GET", body?: unknown) {
  const { storeUrl, apiKey } = await getShopifyCredentials();
  if (!storeUrl || !apiKey) throw new Error("Shopify not configured");
  const response = await fetch(`${normalizeShopifyUrl(storeUrl)}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
    method,
    headers: { "X-Shopify-Access-Token": apiKey, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Shopify API error ${response.status}: ${typeof data?.errors === "string" ? data.errors : JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function syncShopifyProductToStore(shopifyProduct: any) {
  const shopifyProductId = String(shopifyProduct?.id || "").trim();
  if (!shopifyProductId) throw new Error("Shopify product is missing an ID");
  const db = await getDb();
  const existing = await db.select().from(products).where(eq(products.shopifyProductId, shopifyProductId)).limit(1);
  const variants = Array.isArray(shopifyProduct?.variants) ? shopifyProduct.variants : [];
  const firstVariant = variants[0];
  const sizes = variants.map((variant: any) => String(variant.title || variant.option1 || "Default").trim()).filter(Boolean).slice(0, 24);
  const price = firstVariant?.price ? Number(firstVariant.price).toFixed(2) : "29.99";
  const imageUrl = shopifyProduct?.image?.src || shopifyProduct?.images?.[0]?.src || "";
  const values = {
    name: shopifyProduct.title || "Shopify Product",
    description: String(shopifyProduct.body_html || "").replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 2500),
    price,
    category: existing[0]?.category || "mens-t-shirts",
    sizes: sizes.length ? sizes : ["Default"],
    imageUrl,
    badge: existing[0]?.badge || "New Release",
    inStock: true,
    published: String(shopifyProduct.status || "active") === "active",
    hidden: String(shopifyProduct.status || "active") !== "active",
    delisted: false,
    featured: existing[0]?.featured ?? false,
    sortOrder: existing[0]?.sortOrder ?? 0,
    shopifyProductId,
    shopifyVariantId: firstVariant?.id ? String(firstVariant.id) : null,
    updatedAt: new Date(),
  };
  if (existing.length > 0) {
    await db.update(products).set(values).where(eq(products.shopifyProductId, shopifyProductId));
    return { productId: existing[0].id, shopifyProductId, action: values.published ? "updated" : "hidden" };
  }
  await db.insert(products).values(values);
  const [created] = await db.select({ id: products.id }).from(products).where(eq(products.shopifyProductId, shopifyProductId)).limit(1);
  return { productId: created?.id ?? 0, shopifyProductId, action: "created" };
}

async function delistShopifyProduct(shopifyProductId: string) {
  const db = await getDb();
  const existing = await db.select().from(products).where(eq(products.shopifyProductId, shopifyProductId)).limit(1);
  if (existing.length === 0) return { productId: 0, shopifyProductId, action: "ignored" };
  await db.update(products).set({ published: false, hidden: true, delisted: true, inStock: false, badge: "Removed from Shopify", updatedAt: new Date() }).where(eq(products.shopifyProductId, shopifyProductId));
  return { productId: existing[0].id, shopifyProductId, action: "delisted" };
}

function getShopifyWebhookSecret() {
  return (process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_SYNC_SECRET || "").trim();
}

function isShopifyWebhookAuthorized(req: Request) {
  const expected = getShopifyWebhookSecret();
  if (!expected) return true;
  const provided = String(req.query.secret || req.headers["x-shopify-webhook-secret"] || "").trim();
  return provided === expected;
}

router.get("/shopify/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = await getShopifyCredentials();
    res.json({ connected: !!(storeUrl && apiKey), storeUrl });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/shopify/webhooks/setup", requireAdmin, async (req: Request, res: Response) => {
  try {
    const secret = getShopifyWebhookSecret();
    if (!secret) { res.status(400).json({ error: "Set SHOPIFY_WEBHOOK_SECRET or SHOPIFY_SYNC_SECRET in Render before installing webhooks" }); return; }
    const webhookUrl = `${getBackendWebhookBaseUrl(req)}/api/admin/shopify/webhook?secret=${encodeURIComponent(secret)}`;
    const topics = ["products/create", "products/update", "products/delete"];
    const existingData = await shopifyRequest(`/webhooks.json?limit=250`);
    const existing = Array.isArray(existingData?.webhooks) ? existingData.webhooks : [];
    const results = [];
    for (const topic of topics) {
      const alreadyInstalled = existing.some((webhook: any) => webhook?.topic === topic && webhook?.address === webhookUrl);
      if (alreadyInstalled) { results.push({ topic, status: "already-installed" }); continue; }
      try {
        const created = await shopifyRequest(`/webhooks.json`, "POST", { webhook: { topic, address: webhookUrl, format: "json" } });
        results.push({ topic, status: "installed", id: created?.webhook?.id });
      } catch (error: any) {
        results.push({ topic, status: "failed", error: error?.message || "Webhook install failed" });
      }
    }
    res.json({ success: results.some(result => result.status === "installed" || result.status === "already-installed"), webhookUrl, results });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/shopify/webhook", async (req: Request, res: Response) => {
  try {
    if (!isShopifyWebhookAuthorized(req)) { res.status(401).json({ error: "Invalid Shopify webhook secret" }); return; }
    const topic = String(req.headers["x-shopify-topic"] || req.body?.topic || "").trim();
    const shopifyProductId = String(req.body?.id || req.body?.product_id || "").trim();
    let result: unknown;
    if (topic.includes("delete") && shopifyProductId) result = await delistShopifyProduct(shopifyProductId);
    else result = await syncShopifyProductToStore(req.body);
    res.json({ success: true, topic, shopifyProductId, result });
  } catch (e: any) {
    console.error("[Shopify Webhook] Failed:", e);
    res.status(500).json({ error: e.message });
  }
});

router.post("/shopify/credentials", requireAdmin, async (req: Request, res: Response) => {
  try {
    const storeUrl = String(req.body.storeUrl || "").trim();
    const apiKey = String(req.body.apiKey || "").trim();
    await saveSetting("shopify_disabled", "false");
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
    const url = normalizeShopifyUrl(storeUrl);
    const r = await fetch(`${url}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=20`, {
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
    const url = normalizeShopifyUrl(storeUrl);
    const r = await fetch(`${url}/admin/api/${SHOPIFY_API_VERSION}/orders.json?limit=20&status=any`, {
      headers: { 'X-Shopify-Access-Token': apiKey },
    });
    const data = await r.json();
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/shopify/customers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = await getShopifyCredentials();
    if (!storeUrl || !apiKey) { res.status(400).json({ error: 'Shopify not configured' }); return; }
    const url = normalizeShopifyUrl(storeUrl);
    const r = await fetch(`${url}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=20`, {
      headers: { 'X-Shopify-Access-Token': apiKey },
    });
    const data = await r.json();
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/shopify/inventory", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = await getShopifyCredentials();
    if (!storeUrl || !apiKey) { res.status(400).json({ error: 'Shopify not configured' }); return; }
    const url = normalizeShopifyUrl(storeUrl);
    const r = await fetch(`${url}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=20&fields=id,title,variants`, {
      headers: { 'X-Shopify-Access-Token': apiKey },
    });
    const data = await r.json();
    const productsList = Array.isArray(data?.products) ? data.products : [];
    res.json({
      products: productsList.map((product: any) => ({
        id: product.id,
        title: product.title,
        variants: (product.variants || []).map((variant: any) => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          inventoryQuantity: variant.inventory_quantity,
          inventoryPolicy: variant.inventory_policy,
          inventoryManagement: variant.inventory_management,
        })),
      })),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/shopify/webhooks", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = await getShopifyCredentials();
    if (!storeUrl || !apiKey) { res.status(400).json({ error: 'Shopify not configured' }); return; }
    const url = normalizeShopifyUrl(storeUrl);
    const r = await fetch(`${url}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json?limit=50`, {
      headers: { 'X-Shopify-Access-Token': apiKey },
    });
    const data = await r.json();
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/shopify/sync", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = await getShopifyCredentials();
    if (!storeUrl || !apiKey) { res.status(400).json({ error: 'Shopify not configured' }); return; }
    const url = normalizeShopifyUrl(storeUrl);
    const headers = { 'X-Shopify-Access-Token': apiKey };
    const [productsResponse, ordersResponse, customersResponse, webhooksResponse] = await Promise.all([
      fetch(`${url}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=20`, { headers }),
      fetch(`${url}/admin/api/${SHOPIFY_API_VERSION}/orders.json?limit=20&status=any`, { headers }),
      fetch(`${url}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=20`, { headers }),
      fetch(`${url}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json?limit=50`, { headers }),
    ]);
    const [productsData, ordersData, customersData, webhooksData] = await Promise.all([
      productsResponse.json(),
      ordersResponse.json(),
      customersResponse.json(),
      webhooksResponse.json(),
    ]);
    res.json({
      success: productsResponse.ok && ordersResponse.ok && customersResponse.ok && webhooksResponse.ok,
      products: productsData,
      orders: ordersData,
      customers: customersData,
      webhooks: webhooksData,
      summary: {
        products: productsData?.products?.length ?? 0,
        orders: ordersData?.orders?.length ?? 0,
        customers: customersData?.customers?.length ?? 0,
        webhooks: webhooksData?.webhooks?.length ?? 0,
      },
    });
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

const videoSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  videoUrl: z.string().url(),
  thumbnailUrl: z.string().optional(),
  category: z.string().optional(),
  duration: z.string().optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

type VideoInput = {
  title: string;
  videoUrl: string;
  description?: string;
  thumbnailUrl?: string;
  category?: string;
  duration?: string;
  published?: boolean;
  sortOrder?: number;
};

router.post("/videos", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const data = videoSchema.parse(req.body) as VideoInput;
    const [row] = await db.insert(aiVideos).values({
      title: data.title,
      description: data.description,
      videoUrl: data.videoUrl,
      thumbnailUrl: data.thumbnailUrl,
      category: data.category,
      duration: data.duration,
      published: data.published,
      sortOrder: data.sortOrder,
    }).$returningId();
    const [created] = await db.select().from(aiVideos).where(eq(aiVideos.id, row.id));
    res.json(created);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/videos/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const id = Number(req.params.id);
    const data = videoSchema.partial().parse(req.body) as Partial<VideoInput>;
    await db.update(aiVideos).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(aiVideos.id, id));
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

// ─── Temporary read-only production database verification ─────────────────────
const verificationTables = ["orders", "order_events", "product_variants", "order_items", "fulfillment_attempts"] as const;
const verificationConstraints = [
  { table: "orders", name: "orders.stripeEventId", columns: ["stripeEventId"] },
  { table: "orders", name: "orders.stripeCheckoutSessionId", columns: ["stripeCheckoutSessionId"] },
  { table: "orders", name: "orders.stripePaymentIntentId", columns: ["stripePaymentIntentId"] },
  { table: "orders", name: "orders.printifyOrderId", columns: ["printifyOrderId"] },
  { table: "order_events", name: "order_events.stripeEventId", columns: ["stripeEventId"] },
  { table: "product_variants", name: "product_variants(printifyProductId, printifyVariantId)", columns: ["printifyProductId", "printifyVariantId"] },
] as const;
const verificationOrderColumns = [
  "orderToken",
  "customerFirstName",
  "customerLastName",
  "customerStatus",
  "confirmationEmailSent",
  "confirmationEmailSentAt",
  "confirmationEmailStatus",
  "confirmationEmailError",
  "productionEmailSentAt",
  "shippingEmailSentAt",
  "deliveryEmailSentAt",
  "lastSyncAt",
  "lastSyncFailedAt",
  "lastSyncError",
];

async function verifyTableExists(db: any, table: string) {
  try {
    const [rows] = await db.execute(sql.raw(`SHOW CREATE TABLE \`${table}\``)) as any;
    return Boolean(rows?.[0]);
  } catch {
    return false;
  }
}

async function verifyColumnExists(db: any, table: string, column: string) {
  try {
    const [rows] = await db.execute(sql.raw(`SHOW COLUMNS FROM \`${table}\` LIKE '${column.replace(/'/g, "''")}'`)) as any;
    return Boolean(rows?.[0]);
  } catch {
    return false;
  }
}

async function getVerificationIndexes(db: any, table: string) {
  try {
    const [rows] = await db.execute(sql.raw(`SHOW INDEX FROM \`${table}\``)) as any;
    return rows || [];
  } catch {
    return [];
  }
}

function hasUniqueIndex(indexRows: any[], columns: readonly string[]) {
  const grouped = new Map<string, any[]>();
  for (const row of indexRows) {
    if (Number(row.Non_unique) !== 0) continue;
    const keyName = String(row.Key_name || "");
    if (!grouped.has(keyName)) grouped.set(keyName, []);
    grouped.get(keyName)!.push(row);
  }
  for (const rows of grouped.values()) {
    const ordered = rows
      .slice()
      .sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
      .map(row => String(row.Column_name));
    if (ordered.length === columns.length && ordered.every((column, index) => column === columns[index])) return true;
  }
  return false;
}

async function getVerificationDuplicateCount(db: any, table: string, columns: readonly string[]) {
  try {
    const notNullWhere = columns.map(column => `\`${column}\` IS NOT NULL AND \`${column}\` <> ''`).join(" AND ");
    const groupBy = columns.map(column => `\`${column}\``).join(", ");
    const [rows] = await db.execute(sql.raw(`SELECT COALESCE(SUM(duplicateCount - 1), 0) AS duplicateCount FROM (SELECT COUNT(*) AS duplicateCount FROM \`${table}\` WHERE ${notNullWhere} GROUP BY ${groupBy} HAVING COUNT(*) > 1) duplicateRows`)) as any;
    return Number(rows?.[0]?.duplicateCount || 0);
  } catch {
    return -1;
  }
}

router.get("/maintenance/database-verification", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const tables = [];
    for (const table of verificationTables) {
      const exists = await verifyTableExists(db, table);
      tables.push({
        table,
        exists,
        status: exists ? "PASS" : "FAIL",
        safeRecommendedAction: exists ? "No action needed." : `Create missing table ${table} using a reviewed migration.`,
      });
    }

    const constraints = [];
    for (const constraint of verificationConstraints) {
      const tableExists = await verifyTableExists(db, constraint.table);
      const indexes = tableExists ? await getVerificationIndexes(db, constraint.table) : [];
      const exists = tableExists ? hasUniqueIndex(indexes, constraint.columns) : false;
      const duplicateCount = tableExists ? await getVerificationDuplicateCount(db, constraint.table, constraint.columns) : -1;
      constraints.push({
        name: constraint.name,
        table: constraint.table,
        exists,
        duplicateCount,
        status: exists && duplicateCount === 0 ? "PASS" : "FAIL",
        safeRecommendedAction: exists && duplicateCount === 0
          ? "No action needed."
          : duplicateCount > 0
            ? "Resolve duplicate records manually before adding or enforcing this unique constraint."
            : "Add missing unique constraint using a reviewed migration after confirming no duplicates.",
      });
    }

    const columns = [];
    for (const column of verificationOrderColumns) {
      const exists = await verifyColumnExists(db, "orders", column);
      columns.push({
        table: "orders",
        column,
        exists,
        status: exists ? "PASS" : "FAIL",
        safeRecommendedAction: exists ? "No action needed." : `Add missing orders.${column} using a reviewed migration.`,
      });
    }

    res.json({
      checkedAt: new Date().toISOString(),
      overallStatus: [...tables, ...constraints, ...columns].every(item => item.status === "PASS") ? "PASS" : "FAIL",
      tables,
      constraints,
      columns,
    });
  } catch {
    res.status(500).json({ error: "Database verification failed without exposing connection details." });
  }
});

export default router;

