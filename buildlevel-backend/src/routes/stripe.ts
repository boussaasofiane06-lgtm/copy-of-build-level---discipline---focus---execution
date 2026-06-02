import { Router, Request, Response } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { digitalProducts, digitalPurchases, products, siteSettings } from "../db/schema.js";
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
        await createPrintifyOrderFromStripeSession(session);
      } catch (e) {
        console.error("[Webhook] Failed to create Printify order:", e);
      }
    }
  }

  res.json({ received: true });
});

export default router;
