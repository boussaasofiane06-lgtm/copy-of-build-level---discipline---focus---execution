import { Router, Request, Response } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { digitalProducts, digitalPurchases, products, siteSettings, orders, orderItems, fulfillmentAttempts, orderEvents, productVariants } from "../db/schema.js";
import { getProtectedDownloadUrl } from "../storage/objectStorage.js";

const router = Router();
const MAX_PHYSICAL_METADATA_ITEMS = 15;

class StripeCheckoutError extends Error {
  status: number;
  requestId?: string | null;
  stripeError?: unknown;

  constructor(message: string, status: number, requestId?: string | null, stripeError?: unknown) {
    super(message);
    this.name = "StripeCheckoutError";
    this.status = status;
    this.requestId = requestId;
    this.stripeError = stripeError;
  }
}

function getStripeSecretKey() {
  const raw = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!raw) throw new Error("STRIPE_SECRET_KEY is not configured");

  const embeddedKey = raw.match(/sk_(?:test|live)_[A-Za-z0-9]{20,}/)?.[0];
  const key = embeddedKey || raw;

  if (!/^sk_(test|live)_[A-Za-z0-9]{20,}$/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY must be the raw Stripe secret key starting with sk_test_ or sk_live_");
  }

  return key;
}

function getStripeKeyMode() {
  const key = getStripeSecretKey();
  return key.startsWith("sk_live_") ? "live" : "test";
}

function getStripe() {
  return new Stripe(getStripeSecretKey(), {
    apiVersion: "2025-01-27.acacia" as any,
  });
}

function isLocalhostUrl(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(value);
}

function isBackendHost(host: string) {
  return /onrender\.com$/i.test(host) || /^build-level-backend/i.test(host);
}

function normalizeOrigin(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function getFrontendOrigin(req: Request) {
  const forwardedHost = String(req.headers["x-forwarded-host"] || "");
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "https").replace(":", "") || "https";
  if (forwardedHost && !isBackendHost(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const requestOrigin = normalizeOrigin(req.headers.origin);
  if (requestOrigin && (process.env.NODE_ENV !== "production" || !isLocalhostUrl(requestOrigin))) return requestOrigin;

  const envOrigin = normalizeOrigin(process.env.FRONTEND_URL || process.env.PUBLIC_FRONTEND_URL || process.env.SITE_URL);
  if (envOrigin && (process.env.NODE_ENV !== "production" || !isLocalhostUrl(envOrigin))) return envOrigin;

  return process.env.NODE_ENV === "production" ? "https://thebuildlevel.com" : "http://localhost:5173";
}

type CheckoutLineItem = {
  name: string;
  unitAmount: number;
  quantity: number;
  image?: string;
};

type PhysicalCheckoutItem = {
  productId?: number | string;
  size?: string;
  variantId?: number | string;
  name: string;
  priceUSD: number;
  quantity: number;
  image?: string;
};

type PhysicalFulfillmentItem = {
  productId: number;
  size: string;
  variantId?: string;
  quantity: number;
};

type DigitalAccessResult = {
  purchaseId: number;
  productId: number;
  productName: string;
  email: string;
  downloadToken: string;
  downloadUrl: string;
  fileName: string | null;
  stripePaymentIntentId: string;
  downloadLimit: number;
  downloadCount: number;
  remainingDownloads: number;
  expiresAt: string;
  created: boolean;
};

type OrderStatus =
  | "Payment Pending"
  | "Paid"
  | "Awaiting Fulfillment"
  | "Processing"
  | "Printify Order Created"
  | "Awaiting Production Approval"
  | "Sent to Production"
  | "Requires Admin Review"
  | "Failed"
  | "Cancelled"
  | "Shipped"
  | "Delivered";

function isStripeImageUrl(value?: string) {
  return !!value && /^https?:\/\//i.test(value);
}

function cleanText(value?: unknown) {
  return String(value ?? "").trim();
}

function toPositiveCents(value: unknown) {
  const amount = Number.parseFloat(String(value));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid product price: ${value}`);
  }
  return Math.round(amount * 100);
}

function getStripeRequestId(response: globalThis.Response) {
  return response.headers.get("request-id") || response.headers.get("stripe-request-id");
}

function logStripeCheckoutFailure(context: Record<string, unknown>, error: unknown) {
  const details = error instanceof StripeCheckoutError
    ? { message: error.message, status: error.status, requestId: error.requestId, stripeError: error.stripeError }
    : { message: error instanceof Error ? error.message : String(error) };
  console.error("[Stripe Checkout] Failed to create session", { ...context, ...details });
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
      fulfillmentStatus ENUM('Payment Pending','Paid','Awaiting Fulfillment','Processing','Printify Order Created','Awaiting Production Approval','Sent to Production','Requires Admin Review','Failed','Cancelled','Shipped','Delivered') NOT NULL DEFAULT 'Payment Pending',
      printifyOrderId VARCHAR(128) NULL UNIQUE,
      printifyExternalId VARCHAR(128) NULL,
      printifyStatus VARCHAR(128) NULL,
      printifyApiResponse JSON NULL,
      errorMessage TEXT NULL,
      retryCount INT NOT NULL DEFAULT 0,
      processing BOOLEAN NOT NULL DEFAULT false,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `));
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
  await db.execute(sql.raw(`ALTER TABLE orders ADD UNIQUE KEY unique_printify_order_id (printifyOrderId)`)).catch(() => undefined);
  fulfillmentTablesEnsured = true;
}

async function withMysqlLock<T>(lockName: string, fn: () => Promise<T>): Promise<T> {
  const db = await getDb();
  const safeName = lockName.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 64);
  const lockResult = await db.execute(sql.raw(`SELECT GET_LOCK('${safeName}', 10) AS acquired`)) as any;
  const acquired = Array.isArray(lockResult)
    ? Number(lockResult[0]?.[0]?.acquired ?? lockResult[0]?.acquired ?? 0)
    : 0;
  if (acquired !== 1) throw new Error(`Could not acquire processing lock for ${safeName}`);
  try {
    return await fn();
  } finally {
    await db.execute(sql.raw(`SELECT RELEASE_LOCK('${safeName}')`)).catch(() => undefined);
  }
}

function getSessionCustomerEmail(session: Stripe.Checkout.Session) {
  return cleanText(session.customer_details?.email || session.customer_email);
}

function getDigitalProductIdFromSession(session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {};
  const productId = Number(metadata.productId || metadata.digitalProductId || metadata.pdfId);
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new Error(`Missing digital product metadata on Stripe session ${session.id}`);
  }
  return productId;
}

function getStripePaymentReference(session: Stripe.Checkout.Session) {
  return cleanText(typeof session.payment_intent === "string" ? session.payment_intent : session.id);
}

async function getDigitalDownloadUrl(product: typeof digitalProducts.$inferSelect) {
  if (product.fileKey) return getProtectedDownloadUrl(product.fileKey);
  if (product.fileUrl) return product.fileUrl;
  throw new Error(`Digital product ${product.id} has no downloadable file configured`);
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

const productDownloadLimitKey = (productId: number) => `digital_product_${productId}_download_limit`;
const productExpiryDaysKey = (productId: number) => `digital_product_${productId}_expires_days`;
const purchaseDownloadLimitKey = (purchaseId: number) => `digital_purchase_${purchaseId}_download_limit`;
const purchaseDownloadCountKey = (purchaseId: number) => `digital_purchase_${purchaseId}_download_count`;
const purchaseExpiresAtKey = (purchaseId: number) => `digital_purchase_${purchaseId}_expires_at`;

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function getProductAccessPolicy(productId: number) {
  const settings = await getSettingsMap([productDownloadLimitKey(productId), productExpiryDaysKey(productId)]);
  return {
    downloadLimit: toPositiveInt(settings[productDownloadLimitKey(productId)], toPositiveInt(process.env.DIGITAL_DOWNLOAD_LIMIT_DEFAULT, 5)),
    expiresDays: toPositiveInt(settings[productExpiryDaysKey(productId)], toPositiveInt(process.env.DIGITAL_DOWNLOAD_EXPIRES_DAYS, 30)),
  };
}

async function ensurePurchaseAccessPolicy(purchaseId: number, productId: number) {
  const settings = await getSettingsMap([purchaseDownloadLimitKey(purchaseId), purchaseDownloadCountKey(purchaseId), purchaseExpiresAtKey(purchaseId)]);
  let downloadLimit = toPositiveInt(settings[purchaseDownloadLimitKey(purchaseId)], 0);
  let downloadCount = Math.max(0, Number.parseInt(settings[purchaseDownloadCountKey(purchaseId)] || "0", 10) || 0);
  let expiresAt = settings[purchaseExpiresAtKey(purchaseId)] || "";

  if (!downloadLimit || !expiresAt) {
    const policy = await getProductAccessPolicy(productId);
    downloadLimit = downloadLimit || policy.downloadLimit;
    const expiryDate = new Date(Date.now() + policy.expiresDays * 24 * 60 * 60 * 1000);
    expiresAt = expiresAt || expiryDate.toISOString();
    await saveSetting(purchaseDownloadLimitKey(purchaseId), String(downloadLimit));
    await saveSetting(purchaseExpiresAtKey(purchaseId), expiresAt);
  }
  await saveSetting(purchaseDownloadCountKey(purchaseId), String(downloadCount));

  return {
    downloadLimit,
    downloadCount,
    remainingDownloads: Math.max(0, downloadLimit - downloadCount),
    expiresAt,
  };
}

async function createOrGetDigitalAccess(session: Stripe.Checkout.Session, source: "webhook" | "success-page"): Promise<DigitalAccessResult> {
  console.log("[Stripe Digital Access] Processing session", {
    source,
    sessionId: session.id,
    paymentStatus: session.payment_status,
    customerEmail: getSessionCustomerEmail(session),
    metadata: session.metadata,
  });

  if (session.payment_status !== "paid") {
    throw new Error(`Stripe session ${session.id} is not paid (payment_status=${session.payment_status})`);
  }

  const productId = getDigitalProductIdFromSession(session);
  const email = getSessionCustomerEmail(session);
  if (!email) throw new Error(`Stripe session ${session.id} is missing customer email`);

  const db = await getDb();
  const [product] = await db.select().from(digitalProducts).where(eq(digitalProducts.id, productId)).limit(1);
  if (!product) throw new Error(`Digital product ${productId} not found`);

  const stripePaymentIntentId = getStripePaymentReference(session);
  const existing = await db
    .select()
    .from(digitalPurchases)
    .where(eq(digitalPurchases.stripePaymentIntentId, stripePaymentIntentId))
    .limit(1);

  let purchase = existing[0];
  let created = false;

  if (!purchase) {
    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(digitalPurchases).values({
      productId,
      email,
      stripePaymentIntentId,
      downloadToken: token,
      createdAt: new Date(),
    });
    const [createdPurchase] = await db
      .select()
      .from(digitalPurchases)
      .where(eq(digitalPurchases.downloadToken, token))
      .limit(1);
    purchase = createdPurchase;
    created = true;
    console.log("[Stripe Digital Access] Order created and access granted", {
      source,
      sessionId: session.id,
      productId,
      email,
      purchaseId: purchase?.id,
      stripePaymentIntentId,
    });
  } else {
    console.log("[Stripe Digital Access] Existing access found", {
      source,
      sessionId: session.id,
      productId,
      email,
      purchaseId: purchase.id,
      stripePaymentIntentId,
    });
  }

  if (!purchase) throw new Error("Failed to create digital purchase record");

  const accessPolicy = await ensurePurchaseAccessPolicy(purchase.id, productId);
  if (Date.now() > Date.parse(accessPolicy.expiresAt)) {
    throw new Error("This digital purchase access has expired");
  }
  if (accessPolicy.remainingDownloads <= 0) {
    throw new Error("Download limit reached for this purchase");
  }

  return {
    purchaseId: purchase.id,
    productId,
    productName: product.name,
    email: purchase.email || email,
    downloadToken: purchase.downloadToken,
    downloadUrl: `/api/digital/download/${purchase.downloadToken}`,
    fileName: product.fileName,
    stripePaymentIntentId,
    ...accessPolicy,
    created,
  };
}

function buildPhysicalCheckoutMetadata(items: PhysicalCheckoutItem[]) {
  const metadata: Record<string, string> = {
    type: "physical",
    source: "build_level_store",
    item_count: String(Math.min(items.length, MAX_PHYSICAL_METADATA_ITEMS)),
  };

  items.slice(0, MAX_PHYSICAL_METADATA_ITEMS).forEach((item, index) => {
    const productId = cleanText(item.productId);
    const size = cleanText(item.size);
    const variantId = cleanText(item.variantId);
    metadata[`item_${index}_product_id`] = productId;
    metadata[`item_${index}_size`] = size.slice(0, 100);
    metadata[`item_${index}_variant_id`] = variantId.slice(0, 100);
    metadata[`item_${index}_quantity`] = String(Math.max(1, Number(item.quantity || 1)));
  });

  return metadata;
}

function readPhysicalFulfillmentItems(metadata?: Stripe.Metadata | null): PhysicalFulfillmentItem[] {
  if (!metadata || metadata.type !== "physical") return [];
  const itemCount = Math.min(Math.max(Number(metadata.item_count || 0), 0), MAX_PHYSICAL_METADATA_ITEMS);
  const items: PhysicalFulfillmentItem[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const productId = Number(metadata[`item_${index}_product_id`]);
    const quantity = Math.max(1, Number(metadata[`item_${index}_quantity`] || 1));
    if (!Number.isInteger(productId) || productId <= 0) continue;
    items.push({
      productId,
      quantity,
      size: cleanText(metadata[`item_${index}_size`]),
      variantId: cleanText(metadata[`item_${index}_variant_id`]),
    });
  }

  return items;
}

async function getPrintifyCredentials() {
  const db = await getDb();
  const rows = await db.select().from(siteSettings);
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value ?? ""]));
  if (settings.printify_disabled === "true") return { apiKey: "", shopId: "" };
  return {
    apiKey: cleanText(settings.printify_api_key || process.env.PRINTIFY_API_KEY),
    shopId: cleanText(settings.printify_shop_id || process.env.PRINTIFY_SHOP_ID),
  };
}

async function isStripeCheckoutDisabled() {
  const db = await getDb();
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, "stripe_disabled")).limit(1);
  return rows[0]?.value === "true";
}

async function printifyRequest(path: string, method = "GET", body?: unknown) {
  const { apiKey } = await getPrintifyCredentials();
  if (!apiKey) throw new Error("Printify API key is not configured");

  const response = await fetch(`https://api.printify.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : JSON.stringify(data).slice(0, 300);
    throw new Error(`Printify API error ${response.status}: ${message}`);
  }

  return data;
}

function normalizeOption(value?: unknown) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseSelectedVariant(value: string) {
  if (!value.trim().startsWith("{")) return { label: value, variantId: "" };
  try {
    const parsed = JSON.parse(value);
    return { label: cleanText(parsed?.label || value), variantId: cleanText(parsed?.variantId) };
  } catch {
    return { label: value, variantId: "" };
  }
}

function variantMatchesSize(variant: any, selectedSize: string) {
  const selected = parseSelectedVariant(selectedSize);
  if (selected.variantId && String(variant?.id) === selected.variantId) return true;
  selectedSize = selected.label;
  if (!selectedSize) return true;
  const normalizedSize = normalizeOption(selectedSize);
  const normalizedTitle = normalizeOption(variant?.title);
  if (normalizedTitle === normalizedSize) return true;

  const titleParts = cleanText(variant?.title)
    .split(/[\/|,;-]/)
    .map(normalizeOption)
    .filter(Boolean);
  if (titleParts.includes(normalizedSize)) return true;

  const optionValues = Array.isArray(variant?.options) ? variant.options.map(normalizeOption) : [];
  return optionValues.includes(normalizedSize);
}

async function resolvePrintifyVariantId(printifyProductId: string, selectedSize: string, selectedVariantId?: string) {
  const printifyProduct = await printifyRequest(`/shops/${(await getPrintifyCredentials()).shopId}/products/${printifyProductId}.json`);
  const variants = Array.isArray(printifyProduct?.variants) ? printifyProduct.variants : [];
  const activeVariants = variants.filter((variant: any) => variant?.is_enabled !== false && variant?.is_available !== false);
  const candidates = activeVariants.length ? activeVariants : variants;
  if (selectedVariantId && candidates.some((variant: any) => String(variant?.id) === selectedVariantId)) return selectedVariantId;
  const match = candidates.find((variant: any) => variantMatchesSize(variant, selectedSize));

  if (!match) {
    throw new Error(`No Printify variant matches size "${selectedSize || "default"}" for product ${printifyProductId}`);
  }

  return match.id;
}

function splitCustomerName(name?: string | null) {
  const parts = cleanText(name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Build", lastName: "Level Customer" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "Customer" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function buildPrintifyAddress(session: Stripe.Checkout.Session) {
  const shipping = (session as any).shipping_details;
  const customer = (session as any).customer_details;
  const address = shipping?.address || customer?.address;
  if (!address?.line1 || !address?.city || !address?.postal_code || !address?.country) {
    throw new Error("Stripe session does not include a complete shipping address");
  }

  const { firstName, lastName } = splitCustomerName(shipping?.name || customer?.name);
  return {
    first_name: firstName,
    last_name: lastName,
    email: session.customer_email || customer?.email || "",
    phone: customer?.phone || "",
    country: address.country,
    region: address.state || "",
    address1: address.line1,
    address2: address.line2 || "",
    city: address.city,
    zip: address.postal_code,
  };
}

async function createPrintifyOrderFromStripeSession(session: Stripe.Checkout.Session) {
  if (session.payment_status && session.payment_status !== "paid") {
    console.log(`[Printify] Skipping session ${session.id}; payment_status=${session.payment_status}`);
    return;
  }

  const requestedItems = readPhysicalFulfillmentItems(session.metadata);
  if (requestedItems.length === 0) return;

  const { shopId } = await getPrintifyCredentials();
  if (!shopId) throw new Error("Printify shop ID is not configured");

  const db = await getDb();
  const lineItems: Array<{ product_id: string; variant_id: number | string; quantity: number }> = [];

  for (const item of requestedItems) {
    const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
    if (!product?.printifyProductId) continue;

    const variantId = await resolvePrintifyVariantId(product.printifyProductId, item.size, item.variantId);
    lineItems.push({
      product_id: product.printifyProductId,
      variant_id: typeof variantId === "number" ? variantId : String(variantId),
      quantity: item.quantity,
    });
  }

  if (lineItems.length === 0) return;

  const payload = {
    external_id: session.id,
    label: `Build Level ${session.id}`,
    line_items: lineItems,
    shipping_method: 1,
    send_shipping_notification: false,
    address_to: buildPrintifyAddress(session),
  };

  await printifyRequest(`/shops/${shopId}/orders.json`, "POST", payload);
  console.log(`[Printify] Created fulfillment order for Stripe session ${session.id}`);
}

function getPhysicalPaymentReference(session: Stripe.Checkout.Session) {
  return cleanText(typeof session.payment_intent === "string" ? session.payment_intent : session.id);
}

function parseSelectedLabel(value: string) {
  try {
    if (value.trim().startsWith("{")) {
      const parsed = JSON.parse(value);
      return cleanText(parsed?.label || value);
    }
  } catch {
    return value;
  }
  return value;
}

function getOrderCustomerName(session: Stripe.Checkout.Session) {
  return cleanText((session as any).shipping_details?.name || (session as any).customer_details?.name || "");
}

function getOrderShippingAddress(session: Stripe.Checkout.Session) {
  const shipping = (session as any).shipping_details;
  const customer = (session as any).customer_details;
  const address = shipping?.address || customer?.address;
  if (!address) return null;
  return {
    name: shipping?.name || customer?.name || "",
    email: session.customer_email || customer?.email || "",
    phone: customer?.phone || "",
    line1: address.line1 || "",
    line2: address.line2 || "",
    city: address.city || "",
    state: address.state || "",
    postal_code: address.postal_code || "",
    country: address.country || "",
  };
}

function validateShippingAddress(address: ReturnType<typeof getOrderShippingAddress>) {
  if (!address) return "Missing shipping address";
  if (!address.name) return "Missing customer name";
  if (!address.line1) return "Missing address line 1";
  if (!address.city) return "Missing city";
  if (!address.postal_code) return "Missing postal code";
  if (!address.country) return "Missing country";
  return "";
}

async function createInternalPhysicalOrder(eventId: string, session: Stripe.Checkout.Session) {
  await ensureFulfillmentTables();
  const db = await getDb();
  const sessionId = session.id;
  const paymentIntentId = getPhysicalPaymentReference(session);

  const duplicateEvent = await db.select().from(orderEvents).where(eq(orderEvents.stripeEventId, eventId)).limit(1);
  if (duplicateEvent.length > 0) {
    const existing = await db.select().from(orders).where(eq(orders.stripeCheckoutSessionId, sessionId)).limit(1);
    return { order: existing[0], duplicate: true, reason: "Stripe event already processed" };
  }

  const existingOrder = await db.select().from(orders).where(eq(orders.stripeCheckoutSessionId, sessionId)).limit(1);
  if (existingOrder[0]?.printifyOrderId) return { order: existingOrder[0], duplicate: true, reason: "Printify order already created" };
  if (existingOrder[0]?.processing) return { order: existingOrder[0], duplicate: true, reason: "Order already processing" };

  const requestedItems = readPhysicalFulfillmentItems(session.metadata);
  const email = cleanText(session.customer_email || session.customer_details?.email);
  const shippingAddress = getOrderShippingAddress(session);
  const addressError = validateShippingAddress(shippingAddress);
  const paymentStatus = session.payment_status || "unknown";
  const baseStatus: OrderStatus = paymentStatus === "paid" ? "Paid" : "Payment Pending";

  let order = existingOrder[0];
  if (!order) {
    await db.insert(orders).values({
      customerName: getOrderCustomerName(session),
      customerEmail: email || "unknown@example.com",
      customerPhone: cleanText((session as any).customer_details?.phone),
      shippingAddress: shippingAddress || {},
      stripeEventId: eventId,
      stripeCheckoutSessionId: sessionId,
      stripePaymentIntentId: paymentIntentId,
      stripePaymentStatus: paymentStatus,
      orderTotal: session.amount_total != null ? (session.amount_total / 100).toFixed(2) : null,
      currency: session.currency || "usd",
      orderType: "apparel",
      fulfillmentStatus: baseStatus,
      printifyExternalId: sessionId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const [created] = await db.select().from(orders).where(eq(orders.stripeCheckoutSessionId, sessionId)).limit(1);
    order = created;
  }

  if (!order) throw new Error("Failed to create internal order");
  await db.insert(orderEvents).values({ orderId: order.id, eventType: "stripe.checkout.session.completed", stripeEventId: eventId, payload: session as any, createdAt: new Date() }).catch(() => undefined);

  const existingItems = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  if (existingItems.length === 0) {
    for (const item of requestedItems) {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
      const selected = parseSelectedVariant(item.size);
      await db.insert(orderItems).values({
        orderId: order.id,
        productId: item.productId,
        productName: product?.name || `Product ${item.productId}`,
        productType: "apparel",
        quantity: item.quantity,
        selectedSize: selected.label || item.size,
        selectedColor: undefined,
        printifyProductId: product?.printifyProductId || null,
        printifyVariantId: item.variantId || selected.variantId || null,
        unitPrice: product?.price || null,
        fulfillmentSource: product?.printifyProductId ? "printify" : "none",
        createdAt: new Date(),
      });
    }
  }

  const reviewReasons: string[] = [];
  if (paymentStatus !== "paid") reviewReasons.push(`Payment status is ${paymentStatus}`);
  if (addressError) reviewReasons.push(addressError);
  if (requestedItems.length === 0) reviewReasons.push("No physical metadata items found");

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  for (const item of items) {
    if (item.productType !== "apparel") continue;
    if (!item.printifyProductId) reviewReasons.push(`Missing Printify product ID for ${item.productName}`);
    if (!item.printifyVariantId) reviewReasons.push(`Missing Printify variant ID for ${item.productName}`);
    if (item.printifyVariantId) {
      const mapped = await db.select().from(productVariants).where(eq(productVariants.printifyVariantId, item.printifyVariantId)).limit(1);
      if (mapped[0] && (!mapped[0].enabled || !mapped[0].available)) reviewReasons.push(`Printify variant unavailable for ${item.productName}`);
    }
  }

  if (reviewReasons.length > 0) {
    await db.update(orders).set({
      fulfillmentStatus: "Requires Admin Review",
      errorMessage: reviewReasons.join("; "),
      processing: false,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return { order: updated, duplicate: false, requiresReview: true, reason: reviewReasons.join("; ") };
  }

  await db.update(orders).set({ fulfillmentStatus: "Awaiting Fulfillment", updatedAt: new Date() }).where(eq(orders.id, order.id));
  const [updated] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
  return { order: updated, duplicate: false, requiresReview: false, reason: "" };
}

async function createPrintifyOrderForInternalOrder(orderId: number) {
  await ensureFulfillmentTables();
  const db = await getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error(`Order ${orderId} not found`);
  if (order.printifyOrderId) return { skipped: true, reason: "Printify order already exists", order };
  if (order.processing) return { skipped: true, reason: "Order is already processing", order };
  if (process.env.PRINTIFY_CREATE_ORDERS_ENABLED !== "true") {
    await db.update(orders).set({
      fulfillmentStatus: "Requires Admin Review",
      errorMessage: "Printify order creation disabled. Set PRINTIFY_CREATE_ORDERS_ENABLED=true only for an approved test.",
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    return { skipped: true, reason: "Printify order creation disabled", order };
  }
  if (process.env.PRINTIFY_SHIPPING_METHOD_CONFIRMED !== "true") {
    await db.update(orders).set({
      fulfillmentStatus: "Requires Admin Review",
      errorMessage: "Printify shipping method is not confirmed. Set PRINTIFY_SHIPPING_METHOD_CONFIRMED=true only after validating the method for the product/provider/destination.",
      processing: false,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    return { skipped: true, reason: "Printify shipping method not confirmed", order };
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const lineItems = items
    .filter(item => item.fulfillmentSource === "printify")
    .map(item => ({
      product_id: item.printifyProductId,
      variant_id: Number(item.printifyVariantId),
      quantity: item.quantity,
    }));
  if (lineItems.length === 0) throw new Error("No Printify line items available");

  const shippingAddress = order.shippingAddress as any;
  const payload = {
    external_id: order.stripeCheckoutSessionId || `build-level-order-${order.id}`,
    label: `Build Level Order ${order.id}`,
    line_items: lineItems,
    shipping_method: Number(process.env.PRINTIFY_SHIPPING_METHOD || 1),
    send_shipping_notification: false,
    address_to: {
      first_name: String(shippingAddress?.name || "Build").split(" ")[0],
      last_name: String(shippingAddress?.name || "Level Customer").split(" ").slice(1).join(" ") || "Customer",
      email: order.customerEmail,
      phone: order.customerPhone || "",
      country: shippingAddress?.country,
      region: shippingAddress?.state || "",
      address1: shippingAddress?.line1,
      address2: shippingAddress?.line2 || "",
      city: shippingAddress?.city,
      zip: shippingAddress?.postal_code,
    },
  };

  const attemptNumber = order.retryCount + 1;
  await db.update(orders).set({ processing: true, fulfillmentStatus: "Processing", updatedAt: new Date() }).where(eq(orders.id, order.id));
  await db.insert(fulfillmentAttempts).values({ orderId: order.id, attemptNumber, action: "create_printify_order", status: "pending", requestPayload: payload, createdAt: new Date() });
  try {
    const response = await printifyRequest(`/shops/${(await getPrintifyCredentials()).shopId}/orders.json`, "POST", payload);
    await db.update(orders).set({
      printifyOrderId: cleanText((response as any).id),
      printifyExternalId: String(payload.external_id),
      printifyStatus: cleanText((response as any).status || "created"),
      printifyApiResponse: response as any,
      fulfillmentStatus: "Awaiting Production Approval",
      processing: false,
      errorMessage: null,
      retryCount: attemptNumber,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    await db.insert(fulfillmentAttempts).values({ orderId: order.id, attemptNumber, action: "create_printify_order", status: "success", responsePayload: response as any, createdAt: new Date() });
    return { success: true, response };
  } catch (error: any) {
    await db.update(orders).set({
      fulfillmentStatus: "Failed",
      processing: false,
      errorMessage: error.message,
      retryCount: attemptNumber,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    await db.insert(fulfillmentAttempts).values({ orderId: order.id, attemptNumber, action: "create_printify_order", status: "failed", requestPayload: payload, errorMessage: error.message, createdAt: new Date() });
    throw error;
  }
}

async function validatePhysicalCheckoutItems(items: PhysicalCheckoutItem[]) {
  await ensureFulfillmentTables();
  const db = await getDb();
  for (const item of items) {
    const productId = Number(item.productId);
    if (!Number.isInteger(productId) || productId <= 0) throw new Error(`Invalid product mapping for ${item.name}`);
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw new Error(`Product not found for ${item.name}`);
    if (!product.published || product.hidden || product.delisted || !product.inStock) {
      throw new Error(`${product.name} is not available for checkout`);
    }
    if (!product.printifyProductId) {
      throw new Error(`${product.name} is missing Printify product mapping`);
    }
    const variantId = cleanText(item.variantId || parseSelectedVariant(item.size || "").variantId);
    if (!variantId) {
      throw new Error(`${product.name} is missing selected Printify variant mapping`);
    }
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.printifyVariantId, variantId)).limit(1);
    if (!variant) {
      throw new Error(`${product.name} selected variant is not registered in product variants`);
    }
    if (!variant.enabled || !variant.available) {
      throw new Error(`${product.name} selected variant is unavailable`);
    }
  }
}

async function createCheckoutSessionDirect({
  lineItems,
  successUrl,
  cancelUrl,
  customerEmail,
  metadata,
  shippingCountries,
}: {
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
  shippingCountries?: string[];
}) {
  const secretKey = getStripeSecretKey();

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);
  body.set("allow_promotion_codes", "true");
  if (customerEmail) body.set("customer_email", customerEmail);

  lineItems.forEach((item, index) => {
    body.set(`line_items[${index}][price_data][currency]`, "usd");
    body.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    if (isStripeImageUrl(item.image)) body.set(`line_items[${index}][price_data][product_data][images][0]`, item.image);
    body.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmount));
    body.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  shippingCountries?.forEach((country, index) => {
    body.set(`shipping_address_collection[allowed_countries][${index}]`, country);
  });

  for (const [key, value] of Object.entries(metadata || {})) {
    body.set(`metadata[${key}]`, value);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json() as { id?: string; url?: string; error?: { message?: string; type?: string; code?: string; param?: string } };
  if (!response.ok || !data.url) {
    throw new StripeCheckoutError(
      data.error?.message || `Stripe checkout failed with ${response.status}`,
      response.status,
      getStripeRequestId(response),
      data.error,
    );
  }

  return data;
}

// ─── Physical product checkout ────────────────────────────────────────────────
router.post("/checkout", async (req: Request, res: Response) => {
  try {
    if (await isStripeCheckoutDisabled()) {
      res.status(503).json({ error: "Stripe checkout is disabled from the admin integrations panel" });
      return;
    }
    const { items, currency = "usd", customerEmail } = req.body;
    const origin = getFrontendOrigin(req);

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Checkout requires at least one item" });
      return;
    }

    const checkoutItems: PhysicalCheckoutItem[] = items.map((item: any) => ({
      productId: item.productId,
      size: item.size,
      variantId: item.variantId,
      name: cleanText(item.name),
      image: item.image,
      priceUSD: Number(item.priceUSD),
      quantity: Math.max(1, Number(item.quantity || 1)),
    }));
    if (checkoutItems.length > MAX_PHYSICAL_METADATA_ITEMS) {
      res.status(400).json({ error: `Checkout supports up to ${MAX_PHYSICAL_METADATA_ITEMS} unique cart items at once` });
      return;
    }
    if (checkoutItems.some((item) => !item.name || !Number.isFinite(item.priceUSD) || item.priceUSD <= 0)) {
      res.status(400).json({ error: "Checkout contains an invalid product" });
      return;
    }
    await validatePhysicalCheckoutItems(checkoutItems);

    const session = await createCheckoutSessionDirect({
      lineItems: checkoutItems.map((item) => ({
        name: item.name,
        image: item.image,
        unitAmount: Math.round(Number(item.priceUSD) * 100),
        quantity: Number(item.quantity || 1),
      })),
      customerEmail,
      metadata: buildPhysicalCheckoutMetadata(checkoutItems),
      shippingCountries: ["US", "GB", "CA", "AU", "DE", "FR", "JP", "NG", "ZA", "AE"],
      successUrl: `${origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/shop`,
    });

    res.json({ url: session.url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Digital product checkout ─────────────────────────────────────────────────
router.post("/digital-checkout", async (req: Request, res: Response) => {
  const debugContext: Record<string, unknown> = {
    route: "/api/stripe/digital-checkout",
    productId: req.body?.productId,
  };
  try {
    if (await isStripeCheckoutDisabled()) {
      res.status(503).json({ error: "Stripe checkout is disabled from the admin integrations panel", debug: debugContext });
      return;
    }
    const { productId, customerEmail } = req.body;
    const origin = getFrontendOrigin(req);
    const parsedProductId = Number(productId);
    if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
      res.status(400).json({ error: "Valid productId is required", debug: { ...debugContext, receivedProductId: productId } });
      return;
    }

    const db = await getDb();
    const [product] = await db.select().from(digitalProducts).where(eq(digitalProducts.id, parsedProductId)).limit(1);
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }
    if (!product.published) { res.status(404).json({ error: "Product not found" }); return; }

    const unitAmount = toPositiveCents(product.price);
    const stripeMode = getStripeKeyMode();
    Object.assign(debugContext, {
      productId: product.id,
      productName: product.name,
      productPublished: product.published,
      priceUSD: String(product.price),
      unitAmount,
      stripeMode,
      usingInlinePriceData: true,
      stripePaymentLinkConfigured: !!product.stripePaymentLink,
    });
    console.log("[Stripe Digital Checkout] Creating session", debugContext);

    const session = await createCheckoutSessionDirect({
      lineItems: [{
        name: product.name,
        unitAmount,
        quantity: 1,
      }],
      customerEmail,
      metadata: {
        productId: String(parsedProductId),
        digitalProductId: String(parsedProductId),
        pdfId: String(parsedProductId),
        type: "digital",
      },
      successUrl: `${origin}/digital/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/digital`,
    });

    res.json({ url: session.url, debug: { ...debugContext, stripeSessionId: session.id } });
  } catch (e: any) {
    logStripeCheckoutFailure(debugContext, e);
    res.status(e instanceof StripeCheckoutError ? e.status : 500).json({
      error: e.message,
      stripeError: e instanceof StripeCheckoutError ? e.stripeError : undefined,
      stripeRequestId: e instanceof StripeCheckoutError ? e.requestId : undefined,
      debug: debugContext,
    });
  }
});

router.get("/digital-session/:sessionId", async (req: Request, res: Response) => {
  try {
    const sessionId = cleanText(req.params.sessionId);
    if (!sessionId.startsWith("cs_")) {
      res.status(400).json({ error: "Invalid Stripe checkout session ID" });
      return;
    }
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const access = await createOrGetDigitalAccess(session, "success-page");
    res.json({
      success: true,
      purchaseId: access.purchaseId,
      productId: access.productId,
      productName: access.productName,
      email: access.email,
      downloadUrl: access.downloadUrl,
      fileName: access.fileName,
      created: access.created,
    });
  } catch (e: any) {
    console.error("[Stripe Digital Access] Failed session lookup:", e);
    res.status(400).json({ error: e.message });
  }
});

// ─── Stripe webhook ───────────────────────────────────────────────────────────
router.post("/webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    if (!webhookSecret) {
      res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET is not configured" });
      return;
    }
    if (!sig) {
      res.status(400).json({ error: "Missing Stripe signature header" });
      return;
    }
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (e: any) {
    console.error("[Stripe Webhook] Signature verification failed:", e.message);
    res.status(400).json({ error: `Webhook error: ${e.message}` });
    return;
  }

  console.log("[Stripe Webhook] Received", { eventId: event.id, eventType: event.type, liveMode: event.livemode });

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.type === "digital") {
      try {
        console.log("[Stripe Webhook] Digital checkout completed", {
          sessionId: session.id,
          customerEmail: getSessionCustomerEmail(session),
          productId: session.metadata.productId || session.metadata.digitalProductId || session.metadata.pdfId,
          paymentStatus: session.payment_status,
        });
        await createOrGetDigitalAccess(session, "webhook");
      } catch (e) {
        console.error("[Webhook] Failed to record digital purchase:", e);
      }
    } else if (session.metadata?.type === "physical") {
      try {
        await withMysqlLock(`stripe:${session.id}`, async () => {
          const result = await createInternalPhysicalOrder(event.id, session);
          console.log("[Stripe Webhook] Physical order ledger result", {
            sessionId: session.id,
            orderId: result.order?.id,
            duplicate: result.duplicate,
            requiresReview: result.requiresReview,
            reason: result.reason,
          });
          if (result.order && !result.duplicate && !result.requiresReview) {
            await createPrintifyOrderForInternalOrder(result.order.id);
          }
        });
      } catch (e) {
        console.error("[Webhook] Failed to process physical order:", e);
      }
    }
  }

  res.json({ received: true });
});

export default router;
