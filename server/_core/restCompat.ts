import type { Express, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { digitalProducts, products, siteSettings } from "../../drizzle/schema";
import { verifyAdminToken } from "./adminAuth";

const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "x", "pinterest"] as const;
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || "info@thebuildlevel.com";
const SHOPIFY_API_VERSION = "2024-01";
const DEFAULT_MAINTENANCE = {
  enabled: false,
  title: "Coming Back Soon",
  message: "BUILD LEVEL is upgrading the experience. The storefront will return shortly.",
  returnText: "Discipline. Focus. Execution.",
  contactEmail: "info@thebuildlevel.com",
};

function cleanEnv(value?: string) {
  return (value || "").trim();
}

function cleanSecret(value?: string) {
  return cleanEnv(value).replace(/\s+/g, "");
}

function parseCookies(header?: string) {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) map.set(key, decodeURIComponent(rest.join("=")));
  }
  return map;
}

async function requireAdminRest(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const headerToken = req.headers["x-admin-token"] as string | undefined;
  const cookieToken = parseCookies(req.headers.cookie).get("bl_admin_session");

  if (await verifyAdminToken(bearer || headerToken || cookieToken)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
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

async function isIntegrationDisabled(provider: string) {
  const settings = await getSettingsMap([`${provider}_disabled`]);
  return settings[`${provider}_disabled`] === "true";
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function socialEnvStatus(platform: string) {
  const upper = platform === "x" ? "X" : platform.toUpperCase();
  return {
    clientIdConfigured: !!process.env[`${upper}_CLIENT_ID`],
    clientSecretConfigured: !!process.env[`${upper}_CLIENT_SECRET`],
    accessTokenConfigured: !!process.env[`${upper}_ACCESS_TOKEN`],
  };
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

async function getShopifyCredentials() {
  const settings = await getSettingsMap(["shopify_store_url", "shopify_api_key", "shopify_disabled"]);
  if (settings.shopify_disabled === "true") return { storeUrl: "", apiKey: "" };
  return {
    storeUrl: cleanEnv(settings.shopify_store_url || process.env.SHOPIFY_STORE_URL || ""),
    apiKey: cleanEnv(settings.shopify_api_key || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_API_KEY || ""),
  };
}

async function getPrintifyCredentials() {
  const settings = await getSettingsMap(["printify_api_key", "printify_shop_id", "printify_disabled"]);
  if (settings.printify_disabled === "true") return { apiKey: "", shopId: "" };
  return {
    apiKey: cleanEnv(settings.printify_api_key || process.env.PRINTIFY_API_KEY || ""),
    shopId: cleanEnv(settings.printify_shop_id || process.env.PRINTIFY_SHOP_ID || ""),
  };
}

function normalizeShopifyUrl(storeUrl: string) {
  return storeUrl.startsWith("http") ? storeUrl : `https://${storeUrl}`;
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
    const { shopId } = await getPrintifyCredentials();
    const body = status === "error" && reason ? { reason: reason.slice(0, 500) } : undefined;
    await printifyRequestWithBody(`/shops/${shopId}/products/${printifyProductId}/${endpoint}.json`, "POST", body);
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
  const locallyHidden = existing.length > 0 && (existing[0].hidden === true || existing[0].published === false);
  const values = {
    name: product.title || "Printify Product",
    description: cleanPrintifyDescription(product.description),
    price,
    category: existing[0]?.category || "mens-t-shirts",
    sizes: sizes.length ? sizes : ["S", "M", "L", "XL"],
    imageUrl,
    badge: existing[0]?.badge || (visible ? "New Release" : "Coming Soon"),
    inStock: locallyHidden ? false : visible && getPrintifyInStock(product),
    published: locallyHidden ? false : visible,
    hidden: locallyHidden ? true : !visible,
    delisted: locallyHidden ? false : !visible,
    featured: existing[0]?.featured ?? false,
    sortOrder: existing[0]?.sortOrder ?? 0,
    printifyProductId,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db.update(products).set(values).where(eq(products.printifyProductId, printifyProductId));
    return { productId: existing[0].id, printifyProductId, action: visible ? "updated" : "hidden" };
  }

  await db.insert(products).values(values);
  const [created] = await db.select({ id: products.id }).from(products).where(eq(products.printifyProductId, printifyProductId)).limit(1);
  return { productId: created?.id ?? 0, printifyProductId, action: visible ? "created" : "hidden" };
}

async function fetchAllPrintifyProducts() {
  const { shopId } = await getPrintifyCredentials();
  if (!shopId) throw new Error("Printify shop ID not configured");
  const allProducts: any[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const data = await printifyRequest(`/shops/${shopId}/products.json?page=${page}&limit=100`);
    const pageProducts = Array.isArray(data?.data) ? data.data : [];
    allProducts.push(...pageProducts);
    lastPage = Number(data?.last_page || data?.lastPage || page);
    page += 1;
  } while (page <= lastPage && page <= 50);
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
  return cleanEnv(process.env.PRINTIFY_WEBHOOK_SECRET || process.env.PRINTIFY_SYNC_SECRET);
}

function isPrintifyWebhookAuthorized(req: Request) {
  const expected = getPrintifyWebhookSecret();
  if (!expected) return true;
  const provided = cleanEnv(String(req.query.secret || req.headers["x-printify-webhook-secret"] || req.headers["x-printify-signature"] || ""));
  return provided === expected;
}

function getPrintifyWebhookProductId(payload: any) {
  return String(payload?.resource?.id || payload?.resource?.product_id || payload?.data?.id || payload?.data?.product_id || payload?.product?.id || payload?.product_id || payload?.id || "").trim();
}

function getPrintifyWebhookTopic(req: Request, payload: any) {
  return String(payload?.topic || payload?.type || payload?.event || req.headers["x-printify-topic"] || "").trim();
}

function getBackendWebhookBaseUrl(req: Request) {
  const configured = process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
  if (configured) return configured.replace(/\/$/, "");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}`;
}

function getShopifyWebhookSecret() {
  return cleanEnv(process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_SYNC_SECRET);
}

function isShopifyWebhookAuthorized(req: Request) {
  const expected = getShopifyWebhookSecret();
  if (!expected) return true;
  const provided = cleanEnv(String(req.query.secret || req.headers["x-shopify-webhook-secret"] || ""));
  return provided === expected;
}

function isPrintifyAutoSyncAuthorized(req: Request) {
  const expectedSecret = cleanEnv(process.env.PRINTIFY_SYNC_SECRET);
  const providedSecret = cleanEnv(String(req.query.secret || req.headers["x-printify-sync-secret"] || ""));
  return !!expectedSecret && providedSecret === expectedSecret;
}

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

function isEmailConfigured() {
  return !!(cleanEnv(process.env.ZOHO_SMTP_USER) && cleanSecret(process.env.ZOHO_SMTP_PASS));
}

function getTransporter() {
  if (!isEmailConfigured()) throw new Error("Zoho SMTP is not configured");
  return nodemailer.createTransport({
    host: cleanEnv(process.env.ZOHO_SMTP_HOST) || "smtp.zoho.com",
    port: Number(cleanEnv(process.env.ZOHO_SMTP_PORT) || 465),
    secure: String(cleanEnv(process.env.ZOHO_SMTP_SECURE) || "true") === "true",
    auth: {
      user: cleanEnv(process.env.ZOHO_SMTP_USER),
      pass: cleanSecret(process.env.ZOHO_SMTP_PASS),
    },
  });
}

const CART_TTL_DAYS = 30;
const RECOVERY_TOKEN_HOURS = 72;
const SUBSCRIPTION_INTERESTS = ["new_apparel", "digital_products", "audiobooks", "featured_products", "blog_motivation", "build_level_news", "all_updates"] as const;
let retentionTablesEnsured = false;
const subscriptionRateLimit = new Map<string, number[]>();

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase().slice(0, 320);
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

function getClientIp(req: Request) {
  return String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
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

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

async function ensureRetentionTables() {
  if (retentionTablesEnsured) return;
  const db = await requireDb();
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
      INDEX idx_cart_items_cart (cartId)
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
      UNIQUE KEY uq_cart_reminder_stage (cartId, stage)
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
      INDEX idx_subscribers_status (status)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS subscriber_preferences (
      id INT AUTO_INCREMENT PRIMARY KEY,
      subscriberId INT NOT NULL,
      interest VARCHAR(64) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_subscriber_interest (subscriberId, interest)
    )
  `));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS email_campaigns (id INT AUTO_INCREMENT PRIMARY KEY, campaignType VARCHAR(64) NOT NULL DEFAULT 'newsletter', subject VARCHAR(255) NOT NULL, bodyHtml MEDIUMTEXT NULL, audience JSON NULL, status VARCHAR(32) NOT NULL DEFAULT 'draft', scheduledAt TIMESTAMP NULL, sentAt TIMESTAMP NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS email_campaign_recipients (id INT AUTO_INCREMENT PRIMARY KEY, campaignId INT NOT NULL, subscriberId INT NULL, email VARCHAR(320) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'queued', sentAt TIMESTAMP NULL, errorMessage TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_campaign_recipient (campaignId, email))`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS email_events (id INT AUTO_INCREMENT PRIMARY KEY, eventType VARCHAR(64) NOT NULL, email VARCHAR(320) NULL, cartId INT NULL, campaignId INT NULL, subscriberId INT NULL, metadata JSON NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_email_events_email (email))`));
  retentionTablesEnsured = true;
}

const retentionCartItemSchema = z.object({
  productType: z.enum(["apparel", "digital"]),
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(99).default(1),
  selectedSize: z.string().optional().default(""),
  selectedColor: z.string().optional().default(""),
  selectedVariant: z.string().optional().default(""),
  printifyVariantId: z.string().optional().default(""),
});

async function validateRetentionCartItem(raw: z.infer<typeof retentionCartItemSchema>) {
  const db = await requireDb();
  const quantity = Math.max(1, Math.min(99, raw.quantity));
  if (raw.productType === "digital") {
    const [product] = await db.select().from(digitalProducts).where(eq(digitalProducts.id, raw.productId)).limit(1);
    if (!product || !product.published) throw new Error(`Digital product ${raw.productId} is not available`);
    const unitPrice = toMoney(product.price);
    return { productType: "digital", productId: product.id, productName: product.name, imageUrl: product.imageUrl || "", selectedSize: "", selectedColor: "", selectedVariant: raw.selectedVariant || product.productType, printifyProductId: "", printifyVariantId: "", quantity, unitPrice, itemTotal: unitPrice * quantity, validationStatus: "valid", validationMessage: "" };
  }
  const [product] = await db.select().from(products).where(eq(products.id, raw.productId)).limit(1);
  if (!product || !product.published || product.hidden || product.delisted || !product.inStock) throw new Error(`Apparel product ${raw.productId} is not available`);
  if (!product.printifyProductId) throw new Error(`${product.name} is missing Printify product mapping`);
  const variantId = cleanText(raw.printifyVariantId || raw.selectedVariant, 128);
  let unitPrice = toMoney(product.price);
  let variantLabel = cleanText(raw.selectedSize || raw.selectedVariant, 255);
  if (variantId) {
    const [rows] = await db.execute(sql`SELECT * FROM product_variants WHERE printifyVariantId = ${variantId} LIMIT 1`) as any;
    const variant = rows?.[0];
    if (!variant || !variant.enabled || !variant.available) throw new Error(`${product.name} selected variant is unavailable`);
    unitPrice = toMoney(variant.price);
    variantLabel = variant.label || variantLabel || variantId;
  }
  return { productType: "apparel", productId: product.id, productName: product.name, imageUrl: product.imageUrl || "", selectedSize: cleanText(raw.selectedSize || variantLabel, 255), selectedColor: cleanText(raw.selectedColor, 128), selectedVariant: variantLabel || variantId || String(product.id), printifyProductId: product.printifyProductId || "", printifyVariantId: variantId, quantity, unitPrice, itemTotal: unitPrice * quantity, validationStatus: "valid", validationMessage: "" };
}

async function getRetentionCartBySession(sessionId: string) {
  const db = await requireDb();
  const [rows] = await db.execute(sql`SELECT * FROM carts WHERE sessionId = ${sessionId} LIMIT 1`) as any;
  return rows?.[0] || null;
}

async function getRetentionCartWithItems(cartId: number) {
  const db = await requireDb();
  const [cartRows] = await db.execute(sql`SELECT * FROM carts WHERE id = ${cartId} LIMIT 1`) as any;
  const [itemRows] = await db.execute(sql`SELECT * FROM cart_items WHERE cartId = ${cartId} ORDER BY productType, id`) as any;
  return { cart: cartRows?.[0] || null, items: itemRows || [] };
}

async function createRetentionRecoveryToken(cartId: number) {
  const db = await requireDb();
  const token = randomToken();
  const tokenHash = hashToken(token);
  const expiresAt = addHours(RECOVERY_TOKEN_HOURS);
  await db.execute(sql`INSERT INTO cart_recovery_tokens (cartId, tokenHash, expiresAt) VALUES (${cartId}, ${tokenHash}, ${expiresAt})`);
  await db.execute(sql`UPDATE carts SET recoveryTokenHash = ${tokenHash}, recoveryExpiresAt = ${expiresAt}, updatedAt = NOW() WHERE id = ${cartId}`);
  return token;
}

function sanitizeRetentionCart(cart: any, items: any[], recoveryToken?: string) {
  return {
    id: cart?.id,
    sessionId: cart?.sessionId,
    customerEmail: cart?.customerEmail || "",
    customerFirstName: cart?.customerFirstName || "",
    status: cart?.status || "active",
    subtotal: Number(cart?.subtotal || 0),
    itemCount: Number(cart?.itemCount || 0),
    recoveryUrl: recoveryToken ? `/cart/recover/${recoveryToken}` : undefined,
    lastActivityAt: cart?.lastActivityAt,
    expiresAt: cart?.expiresAt,
    items: items.map((item: any) => ({ productType: item.productType, productId: Number(item.productId), productName: item.productName, imageUrl: item.imageUrl, selectedSize: item.selectedSize, selectedColor: item.selectedColor, selectedVariant: item.selectedVariant, printifyVariantId: item.printifyVariantId, quantity: Number(item.quantity || 1), unitPrice: Number(item.unitPrice || 0), itemTotal: Number(item.itemTotal || 0), validationStatus: item.validationStatus, validationMessage: item.validationMessage })),
  };
}

async function getRetentionSettings() {
  const settings = await getSettingsMap();
  return {
    recoveryEnabled: settings.cart_recovery_enabled !== "false",
    firstReminderHours: Number(settings.cart_recovery_first_hours || 1),
    secondReminderHours: Number(settings.cart_recovery_second_hours || 24),
    finalReminderHours: Number(settings.cart_recovery_final_hours || 72),
    abandonedAfterMinutes: Number(settings.cart_abandoned_after_minutes || 60),
    reminderSubject: settings.cart_recovery_subject || "You left something behind at Build Level",
    reminderIntro: settings.cart_recovery_intro || "You left something in your Build Level cart. Your selections are still waiting when you're ready to continue.",
  };
}

async function markInactiveRetentionCartsAbandoned() {
  const settings = await getRetentionSettings();
  if (!settings.recoveryEnabled) return;
  const db = await requireDb();
  await db.execute(sql`UPDATE carts SET status = 'abandoned', updatedAt = NOW() WHERE status = 'active' AND itemCount > 0 AND customerEmail IS NOT NULL AND remindersDisabled = false AND lastActivityAt < DATE_SUB(NOW(), INTERVAL ${settings.abandonedAfterMinutes} MINUTE)`);
  await db.execute(sql`INSERT INTO abandoned_carts (cartId, customerEmail, status) SELECT id, customerEmail, 'eligible' FROM carts WHERE status = 'abandoned' AND customerEmail IS NOT NULL ON DUPLICATE KEY UPDATE status = IF(status IN ('recovered','resolved','expired','unsubscribed','blocked'), status, 'eligible'), updatedAt = NOW()`);
}

export function registerRestCompatRoutes(app: Express) {
  app.get("/api/admin/integrations/overview", requireAdminRest, async (_req, res) => {
    try {
      const settings = await getSettingsMap();
      const shopify = await getShopifyCredentials();
      const printify = await getPrintifyCredentials();
      const shopifyDisabled = settings.shopify_disabled === "true";
      const printifyDisabled = settings.printify_disabled === "true";
      const stripeDisabled = settings.stripe_disabled === "true";
      const tidioDisabled = settings.tidio_disabled === "true";
      const stripeConfigured = !stripeDisabled && !!process.env.STRIPE_SECRET_KEY;
      const stripeWebhookConfigured = !!process.env.STRIPE_WEBHOOK_SECRET;
      res.json({
        generatedAt: new Date().toISOString(),
        integrations: {
          shopify: {
            connected: !!(shopify.storeUrl && shopify.apiKey),
            disabled: shopifyDisabled,
            storeUrl: shopify.storeUrl,
            token: maskSecret(shopify.apiKey),
            capabilities: ["products", "inventory", "orders", "customers", "webhooks"],
          },
          printify: {
            connected: !!(printify.apiKey && printify.shopId),
            disabled: printifyDisabled,
            shopId: printify.shopId,
            token: maskSecret(printify.apiKey),
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

  app.get("/api/admin/integrations/stripe/dashboard", requireAdminRest, async (_req, res) => {
    try {
      if (await isIntegrationDisabled("stripe")) {
        res.json({ connected: false, disabled: true, payments: [], sessions: [], message: "Stripe is disconnected" });
        return;
      }
      const stripe = getStripeClient();
      if (!stripe) {
        res.json({ connected: false, payments: [], sessions: [], message: "STRIPE_SECRET_KEY is not configured" });
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

  app.get("/api/admin/integrations/tidio/config", requireAdminRest, async (_req, res) => {
    try {
      const settings = await getSettingsMap();
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

  app.post("/api/admin/integrations/tidio/config", requireAdminRest, async (req, res) => {
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

  app.get("/api/social-links", async (_req, res) => {
    try {
      const settings = await getSettingsMap();
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

  app.get("/api/maintenance", async (_req, res) => {
    try {
      const settings = await getSettingsMap();
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

  app.get("/api/tidio/config", async (_req, res) => {
    try {
      const settings = await getSettingsMap();
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

  app.post("/api/contact", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(120),
        email: z.string().email().max(320),
        message: z.string().min(5).max(5000),
      });
      const data = schema.parse(req.body);
      const transporter = getTransporter();
      const from = cleanEnv(process.env.ZOHO_SMTP_FROM) || BUSINESS_EMAIL;
      await transporter.sendMail({
        from,
        to: BUSINESS_EMAIL,
        replyTo: data.email,
        subject: `Build Level contact: ${data.name}`,
        text: `Name: ${data.name}\nEmail: ${data.email}\n\n${data.message}`,
      });
      await transporter.sendMail({
        from,
        to: data.email,
        subject: "We received your Build Level message",
        text: `Thanks ${data.name},\n\nWe received your message and will reply from ${BUSINESS_EMAIL} soon.\n\nBUILD LEVEL`,
      }).catch(() => undefined);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ success: false, error: isEmailConfigured() ? e.message : "Email delivery is not configured" });
    }
  });

  app.post("/api/cart/sync", async (req, res) => {
    try {
      await ensureRetentionTables();
      const schema = z.object({
        sessionId: z.string().min(8).max(128),
        customerEmail: z.string().email().optional().or(z.literal("")),
        customerFirstName: z.string().max(160).optional().default(""),
        items: z.array(retentionCartItemSchema).max(30),
      });
      const data = schema.parse(req.body);
      const db = await requireDb();
      const email = cleanEmail(data.customerEmail);
      const firstName = cleanText(data.customerFirstName, 160);
      const validated = [];
      for (const item of data.items) validated.push(await validateRetentionCartItem(item));
      const subtotal = validated.reduce((sum, item) => sum + item.itemTotal, 0);
      const itemCount = validated.reduce((sum, item) => sum + item.quantity, 0);
      const status = itemCount === 0 ? "resolved" : "active";
      const expiresAt = addDays(CART_TTL_DAYS);
      await db.execute(sql`INSERT INTO carts (sessionId, customerEmail, customerFirstName, status, subtotal, itemCount, lastActivityAt, expiresAt) VALUES (${data.sessionId}, ${email || null}, ${firstName || null}, ${status}, ${subtotal.toFixed(2)}, ${itemCount}, NOW(), ${expiresAt}) ON DUPLICATE KEY UPDATE customerEmail = COALESCE(VALUES(customerEmail), customerEmail), customerFirstName = COALESCE(VALUES(customerFirstName), customerFirstName), status = VALUES(status), subtotal = VALUES(subtotal), itemCount = VALUES(itemCount), lastActivityAt = NOW(), expiresAt = VALUES(expiresAt), updatedAt = NOW()`);
      const cart = await getRetentionCartBySession(data.sessionId);
      await db.execute(sql`DELETE FROM cart_items WHERE cartId = ${cart.id}`);
      for (const item of validated) {
        await db.execute(sql`INSERT INTO cart_items (cartId, productType, productId, productName, imageUrl, selectedSize, selectedColor, selectedVariant, printifyProductId, printifyVariantId, quantity, unitPrice, itemTotal, validationStatus, validationMessage) VALUES (${cart.id}, ${item.productType}, ${item.productId}, ${item.productName}, ${item.imageUrl}, ${item.selectedSize}, ${item.selectedColor}, ${item.selectedVariant}, ${item.printifyProductId}, ${item.printifyVariantId}, ${item.quantity}, ${item.unitPrice.toFixed(2)}, ${item.itemTotal.toFixed(2)}, ${item.validationStatus}, ${item.validationMessage})`);
      }
      const settings = await getRetentionSettings();
      let recoveryToken = "";
      if (email && itemCount > 0 && settings.recoveryEnabled) {
        recoveryToken = await createRetentionRecoveryToken(cart.id);
        await db.execute(sql`INSERT INTO abandoned_carts (cartId, customerEmail, status) VALUES (${cart.id}, ${email}, 'eligible') ON DUPLICATE KEY UPDATE customerEmail = VALUES(customerEmail), status = IF(status IN ('recovered','resolved','expired'), status, 'eligible'), updatedAt = NOW()`);
      } else if (itemCount === 0) {
        await db.execute(sql`UPDATE abandoned_carts SET status = 'resolved', updatedAt = NOW() WHERE cartId = ${cart.id} AND status IN ('eligible','paused')`);
        await db.execute(sql`UPDATE cart_reminders SET status = 'cancelled' WHERE cartId = ${cart.id} AND status = 'scheduled'`);
      }
      const saved = await getRetentionCartWithItems(cart.id);
      res.json({ success: true, cart: sanitizeRetentionCart(saved.cart, saved.items, recoveryToken || undefined) });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/cart/converted", async (req, res) => {
    try {
      await ensureRetentionTables();
      const data = z.object({ sessionId: z.string().min(8).max(128), completedOrderId: z.string().max(128).optional().default("") }).parse(req.body);
      const db = await requireDb();
      const cart = await getRetentionCartBySession(data.sessionId);
      if (cart) {
        await db.execute(sql`UPDATE carts SET status = 'converted', completedOrderId = ${data.completedOrderId || null}, remindersDisabled = true, updatedAt = NOW() WHERE id = ${cart.id}`);
        await db.execute(sql`UPDATE abandoned_carts SET status = 'recovered', recoveredAt = NOW(), completedOrderId = ${data.completedOrderId || null}, updatedAt = NOW() WHERE cartId = ${cart.id}`);
        await db.execute(sql`UPDATE cart_reminders SET status = 'cancelled' WHERE cartId = ${cart.id} AND status = 'scheduled'`);
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/cart/recover/:token", async (req, res) => {
    try {
      await ensureRetentionTables();
      const db = await requireDb();
      const tokenHash = hashToken(String(req.params.token || ""));
      const [tokenRows] = await db.execute(sql`SELECT * FROM cart_recovery_tokens WHERE tokenHash = ${tokenHash} AND status = 'active' AND expiresAt > NOW() LIMIT 1`) as any;
      const tokenRow = tokenRows?.[0];
      if (!tokenRow) { res.status(404).json({ error: "Recovery link is expired or invalid" }); return; }
      const saved = await getRetentionCartWithItems(tokenRow.cartId);
      if (!saved.cart || saved.cart.status === "converted") { res.status(404).json({ error: "Cart is no longer available" }); return; }
      await db.execute(sql`UPDATE cart_recovery_tokens SET status = 'used', usedAt = NOW() WHERE id = ${tokenRow.id}`);
      res.json({ success: true, cart: sanitizeRetentionCart(saved.cart, saved.items) });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/subscribe", async (req, res) => {
    try {
      await ensureRetentionTables();
      const ip = getClientIp(req) || "unknown";
      const now = Date.now();
      const recent = (subscriptionRateLimit.get(ip) || []).filter((timestamp) => now - timestamp < 60_000);
      if (recent.length >= 5) { res.status(429).json({ error: "Please wait before subscribing again" }); return; }
      recent.push(now);
      subscriptionRateLimit.set(ip, recent);
      const schema = z.object({
        email: z.string().email().max(320),
        firstName: z.string().max(160).optional().default(""),
        interests: z.array(z.enum(SUBSCRIPTION_INTERESTS)).min(1).default(["all_updates"]),
        source: z.string().max(128).optional().default("website"),
        consent: z.boolean().refine(Boolean, "Consent is required"),
      });
      const data = schema.parse(req.body);
      const db = await requireDb();
      const email = cleanEmail(data.email);
      const token = randomToken();
      const tokenHash = hashToken(token);
      const consentEntry = { at: new Date().toISOString(), source: data.source, ip, interests: data.interests };
      await db.execute(sql`INSERT INTO subscribers (email, firstName, status, subscriptionSource, consentStatus, consentIp, consentHistory, manageTokenHash, subscribedAt) VALUES (${email}, ${cleanText(data.firstName, 160) || null}, 'active', ${cleanText(data.source, 128)}, 'subscribed', ${ip}, ${[consentEntry] as any}, ${tokenHash}, NOW()) ON DUPLICATE KEY UPDATE firstName = COALESCE(VALUES(firstName), firstName), status = 'active', consentStatus = 'subscribed', subscriptionSource = VALUES(subscriptionSource), consentIp = VALUES(consentIp), consentHistory = VALUES(consentHistory), manageTokenHash = VALUES(manageTokenHash), unsubscribedAt = NULL, updatedAt = NOW()`);
      const [subscriberRows] = await db.execute(sql`SELECT id FROM subscribers WHERE email = ${email} LIMIT 1`) as any;
      const subscriberId = Number(subscriberRows?.[0]?.id);
      for (const interest of data.interests) {
        await db.execute(sql`INSERT INTO subscriber_preferences (subscriberId, interest, enabled) VALUES (${subscriberId}, ${interest}, true) ON DUPLICATE KEY UPDATE enabled = true, updatedAt = NOW()`);
      }
      res.json({ success: true, message: "You're in. Welcome to Build Level.", manageUrl: `/email/preferences/${token}` });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/email/preferences/:token", async (req, res) => {
    try {
      await ensureRetentionTables();
      const db = await requireDb();
      const [rows] = await db.execute(sql`SELECT * FROM subscribers WHERE manageTokenHash = ${hashToken(String(req.params.token || ""))} LIMIT 1`) as any;
      const subscriber = rows?.[0];
      if (!subscriber) { res.status(404).json({ error: "Preferences link is invalid" }); return; }
      const [prefs] = await db.execute(sql`SELECT interest, enabled FROM subscriber_preferences WHERE subscriberId = ${subscriber.id}`) as any;
      res.json({ success: true, subscriber: { email: subscriber.email, firstName: subscriber.firstName, status: subscriber.status, interests: prefs } });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/email/preferences/:token", async (req, res) => {
    try {
      await ensureRetentionTables();
      const data = z.object({ firstName: z.string().max(160).optional().default(""), interests: z.array(z.enum(SUBSCRIPTION_INTERESTS)).min(1), active: z.boolean().default(true) }).parse(req.body);
      const db = await requireDb();
      const [rows] = await db.execute(sql`SELECT * FROM subscribers WHERE manageTokenHash = ${hashToken(String(req.params.token || ""))} LIMIT 1`) as any;
      const subscriber = rows?.[0];
      if (!subscriber) { res.status(404).json({ error: "Preferences link is invalid" }); return; }
      await db.execute(sql`UPDATE subscribers SET firstName = ${cleanText(data.firstName, 160) || null}, status = ${data.active ? "active" : "unsubscribed"}, consentStatus = ${data.active ? "subscribed" : "unsubscribed"}, unsubscribedAt = ${data.active ? null : new Date()}, updatedAt = NOW() WHERE id = ${subscriber.id}`);
      await db.execute(sql`UPDATE subscriber_preferences SET enabled = false WHERE subscriberId = ${subscriber.id}`);
      for (const interest of data.interests) await db.execute(sql`INSERT INTO subscriber_preferences (subscriberId, interest, enabled) VALUES (${subscriber.id}, ${interest}, true) ON DUPLICATE KEY UPDATE enabled = true, updatedAt = NOW()`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/email/unsubscribe/:token", async (req, res) => {
    try {
      await ensureRetentionTables();
      const db = await requireDb();
      const [rows] = await db.execute(sql`SELECT * FROM subscribers WHERE manageTokenHash = ${hashToken(String(req.params.token || ""))} LIMIT 1`) as any;
      const subscriber = rows?.[0];
      if (!subscriber) { res.status(404).json({ error: "Unsubscribe link is invalid" }); return; }
      await db.execute(sql`UPDATE subscribers SET status = 'unsubscribed', consentStatus = 'unsubscribed', unsubscribedAt = NOW(), updatedAt = NOW() WHERE id = ${subscriber.id}`);
      await db.execute(sql`UPDATE abandoned_carts SET status = 'unsubscribed', updatedAt = NOW() WHERE customerEmail = ${subscriber.email} AND status = 'eligible'`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/admin/subscribers", requireAdminRest, async (req, res) => {
    try {
      await ensureRetentionTables();
      const db = await requireDb();
      const search = `%${cleanText(req.query.search, 160)}%`;
      const interest = cleanText(req.query.interest, 64);
      const status = cleanText(req.query.status, 32);
      const source = cleanText(req.query.source, 128);
      const [rows] = await db.execute(sql`SELECT s.*, GROUP_CONCAT(CONCAT(p.interest, ':', p.enabled) ORDER BY p.interest) AS preferences FROM subscribers s LEFT JOIN subscriber_preferences p ON p.subscriberId = s.id WHERE (${search} = '%%' OR s.email LIKE ${search} OR s.firstName LIKE ${search}) AND (${status} = '' OR s.status = ${status}) AND (${source} = '' OR s.subscriptionSource = ${source}) AND (${interest} = '' OR EXISTS (SELECT 1 FROM subscriber_preferences sp WHERE sp.subscriberId = s.id AND sp.interest = ${interest} AND sp.enabled = true)) GROUP BY s.id ORDER BY s.createdAt DESC LIMIT 500`) as any;
      res.json(rows || []);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/subscribers/:id", requireAdminRest, async (req, res) => {
    try {
      await ensureRetentionTables();
      const id = Number(req.params.id);
      const data = z.object({ status: z.enum(["active", "unsubscribed", "blocked"]).optional(), firstName: z.string().max(160).optional(), interests: z.array(z.enum(SUBSCRIPTION_INTERESTS)).optional() }).parse(req.body);
      const db = await requireDb();
      if (data.status) await db.execute(sql`UPDATE subscribers SET status = ${data.status}, consentStatus = ${data.status === "active" ? "subscribed" : data.status}, unsubscribedAt = ${data.status === "active" ? null : new Date()}, updatedAt = NOW() WHERE id = ${id}`);
      if (data.firstName !== undefined) await db.execute(sql`UPDATE subscribers SET firstName = ${cleanText(data.firstName, 160) || null}, updatedAt = NOW() WHERE id = ${id}`);
      if (data.interests) {
        await db.execute(sql`UPDATE subscriber_preferences SET enabled = false WHERE subscriberId = ${id}`);
        for (const interest of data.interests) await db.execute(sql`INSERT INTO subscriber_preferences (subscriberId, interest, enabled) VALUES (${id}, ${interest}, true) ON DUPLICATE KEY UPDATE enabled = true, updatedAt = NOW()`);
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/admin/subscribers/export.csv", requireAdminRest, async (_req, res) => {
    await ensureRetentionTables();
    const db = await requireDb();
    const [rows] = await db.execute(sql`SELECT email, firstName, status, subscriptionSource, subscribedAt, unsubscribedAt FROM subscribers ORDER BY createdAt DESC`) as any;
    const csv = ["email,firstName,status,subscriptionSource,subscribedAt,unsubscribedAt", ...(rows || []).map((row: any) => [row.email, row.firstName || "", row.status, row.subscriptionSource || "", row.subscribedAt || "", row.unsubscribedAt || ""].map((value) => `"${String(value).replace(/"/g, "\"\"")}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=build-level-subscribers.csv");
    res.send(csv);
  });

  app.get("/api/admin/abandoned-carts", requireAdminRest, async (req, res) => {
    try {
      await ensureRetentionTables();
      await markInactiveRetentionCartsAbandoned();
      const db = await requireDb();
      const status = cleanText(req.query.status, 32);
      const [rows] = await db.execute(sql`SELECT c.*, a.status AS recoveryStatus, a.reminderStage, a.reminderCount AS recoveryReminderCount, a.recoveredAt, a.completedOrderId AS recoveredOrderId FROM carts c LEFT JOIN abandoned_carts a ON a.cartId = c.id WHERE (${status} = '' OR c.status = ${status} OR a.status = ${status}) ORDER BY c.updatedAt DESC LIMIT 300`) as any;
      res.json(rows || []);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/abandoned-carts/:id", requireAdminRest, async (req, res) => {
    try {
      await ensureRetentionTables();
      const saved = await getRetentionCartWithItems(Number(req.params.id));
      if (!saved.cart) { res.status(404).json({ error: "Cart not found" }); return; }
      res.json({ cart: sanitizeRetentionCart(saved.cart, saved.items) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/admin/abandoned-carts/:id", requireAdminRest, async (req, res) => {
    try {
      await ensureRetentionTables();
      const id = Number(req.params.id);
      const { action } = z.object({ action: z.enum(["stop", "resolve", "enable", "delete_expired"]) }).parse(req.body);
      const db = await requireDb();
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
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/admin/abandoned-carts/:id/reminder", requireAdminRest, async (req, res) => {
    try {
      await ensureRetentionTables();
      const id = Number(req.params.id);
      const db = await requireDb();
      const saved = await getRetentionCartWithItems(id);
      if (!saved.cart || !saved.cart.customerEmail) { res.status(400).json({ error: "Cart has no customer email" }); return; }
      const token = await createRetentionRecoveryToken(id);
      const settings = await getRetentionSettings();
      const origin = getFrontendOrigin(req);
      const recoveryUrl = `${origin}/cart/recover/${token}`;
      const manageToken = randomToken();
      await db.execute(sql`UPDATE subscribers SET manageTokenHash = ${hashToken(manageToken)}, updatedAt = NOW() WHERE email = ${saved.cart.customerEmail}`);
      const unsubscribeUrl = `${origin}/email/preferences/${manageToken}`;
      const itemsText = saved.items.map((item: any) => `${item.productName} (${item.selectedVariant || item.selectedSize || item.productType}) - $${Number(item.itemTotal).toFixed(2)}`).join("\n");
      if (!isEmailConfigured()) {
        res.json({ success: true, skipped: true, message: "Email is not configured; reminder was logged but not sent.", recoveryUrl });
        return;
      }
      const transporter = getTransporter();
      const from = cleanEnv(process.env.ZOHO_SMTP_FROM) || BUSINESS_EMAIL;
      await transporter.sendMail({ from, to: saved.cart.customerEmail, subject: settings.reminderSubject, text: `${settings.reminderIntro}\n\n${itemsText}\n\nReturn to cart: ${recoveryUrl}\nUnsubscribe: ${unsubscribeUrl}` });
      await db.execute(sql`INSERT INTO cart_reminders (cartId, stage, status, subject, sentAt) VALUES (${id}, ${cleanText(req.body?.stage || "manual", 32)}, 'sent', ${settings.reminderSubject}, NOW()) ON DUPLICATE KEY UPDATE status = 'sent', sentAt = NOW(), subject = VALUES(subject)`);
      await db.execute(sql`UPDATE carts SET reminderCount = reminderCount + 1, updatedAt = NOW() WHERE id = ${id}`);
      await db.execute(sql`UPDATE abandoned_carts SET reminderCount = reminderCount + 1, lastReminderAt = NOW(), updatedAt = NOW() WHERE cartId = ${id}`);
      res.json({ success: true, recoveryUrl });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/admin/abandoned-carts/settings", requireAdminRest, async (_req, res) => {
    await ensureRetentionTables();
    res.json(await getRetentionSettings());
  });

  app.post("/api/admin/abandoned-carts/settings", requireAdminRest, async (req, res) => {
    try {
      await ensureRetentionTables();
      const data = z.object({ recoveryEnabled: z.boolean(), firstReminderHours: z.number().min(0).max(720), secondReminderHours: z.number().min(0).max(720), finalReminderHours: z.number().min(0).max(720), abandonedAfterMinutes: z.number().min(5).max(10080), reminderSubject: z.string().max(255), reminderIntro: z.string().max(1000) }).parse(req.body);
      const entries: Record<string, string> = { cart_recovery_enabled: String(data.recoveryEnabled), cart_recovery_first_hours: String(data.firstReminderHours), cart_recovery_second_hours: String(data.secondReminderHours), cart_recovery_final_hours: String(data.finalReminderHours), cart_abandoned_after_minutes: String(data.abandonedAfterMinutes), cart_recovery_subject: data.reminderSubject, cart_recovery_intro: data.reminderIntro };
      for (const [key, value] of Object.entries(entries)) await saveSetting(key, value);
      res.json({ success: true, settings: await getRetentionSettings() });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/admin/retention/summary", requireAdminRest, async (_req, res) => {
    try {
      await ensureRetentionTables();
      await markInactiveRetentionCartsAbandoned();
      const db = await requireDb();
      const [[cartCounts], [subscriberCounts], [productRows]] = await Promise.all([
        db.execute(sql`SELECT SUM(status='active') AS activeCarts, SUM(status='abandoned') AS abandonedCarts, SUM(status IN ('recovered','converted')) AS recoveredCarts, SUM(CASE WHEN status IN ('recovered','converted') THEN subtotal ELSE 0 END) AS revenueRecovered FROM carts`) as any,
        db.execute(sql`SELECT COUNT(*) AS totalSubscribers, SUM(status='active') AS activeSubscribers, SUM(status='unsubscribed') AS unsubscribeCount, SUM(createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS newSubscribersThisMonth FROM subscribers`) as any,
        db.execute(sql`SELECT productName, productType, SUM(quantity) AS quantity FROM cart_items GROUP BY productName, productType ORDER BY quantity DESC LIMIT 10`) as any,
      ]);
      res.json({ carts: cartCounts?.[0] || {}, subscribers: subscriberCounts?.[0] || {}, mostAddedProducts: productRows || [] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/integrations/social/settings", requireAdminRest, async (_req, res) => {
    try {
      const settings = await getSettingsMap();
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

  app.get("/api/admin/maintenance", requireAdminRest, async (_req, res) => {
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
        title: settings.maintenance_title || DEFAULT_MAINTENANCE.title,
        message: settings.maintenance_message || DEFAULT_MAINTENANCE.message,
        returnText: settings.maintenance_return_text || DEFAULT_MAINTENANCE.returnText,
        contactEmail: settings.maintenance_contact_email || DEFAULT_MAINTENANCE.contactEmail,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/maintenance", requireAdminRest, async (req, res) => {
    try {
      const schema = z.object({
        enabled: z.boolean().default(false),
        title: z.string().min(1).max(160),
        message: z.string().min(1).max(1000),
        returnText: z.string().max(180).default(""),
        contactEmail: z.string().email().default(DEFAULT_MAINTENANCE.contactEmail),
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

  app.post("/api/admin/integrations/social/settings", requireAdminRest, async (req, res) => {
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
        if (platform.url && !isValidHttpUrl(platform.url)) {
          res.status(400).json({ error: `Invalid URL for ${platform.platform}` });
          return;
        }
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

  app.post("/api/admin/integrations/test/:provider", requireAdminRest, async (req, res) => {
    try {
      const provider = req.params.provider;
      if (await isIntegrationDisabled(provider)) {
        res.json({ ok: false, message: `${provider} is disconnected` });
        return;
      }
      if (provider === "shopify") {
        await shopifyRequest(`/shop.json`);
        res.json({ ok: true, message: "Shopify connected" });
        return;
      }
      if (provider === "printify") {
        await printifyRequest(`/shops.json`);
        res.json({ ok: true, message: "Printify connected" });
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

  app.post("/api/admin/integrations/disconnect/:provider", requireAdminRest, async (req, res) => {
    try {
      const provider = req.params.provider;
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

  app.post("/api/admin/integrations/enable/:provider", requireAdminRest, async (req, res) => {
    try {
      const provider = req.params.provider;
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

  app.get("/api/admin/shopify/status", requireAdminRest, async (_req, res) => {
    const creds = await getShopifyCredentials();
    res.json({ connected: !!(creds.storeUrl && creds.apiKey), storeUrl: creds.storeUrl });
  });

  app.post("/api/admin/shopify/credentials", requireAdminRest, async (req, res) => {
    try {
      const schema = z.object({ storeUrl: z.string().min(1), apiKey: z.string().min(1) });
      const data = schema.parse(req.body);
      await saveSetting("shopify_disabled", "false");
      await saveSetting("shopify_store_url", cleanEnv(data.storeUrl));
      await saveSetting("shopify_api_key", cleanEnv(data.apiKey));
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/admin/shopify/webhooks/setup", requireAdminRest, async (req, res) => {
    try {
      const secret = getShopifyWebhookSecret();
      if (!secret) { res.status(400).json({ error: "Set SHOPIFY_WEBHOOK_SECRET or SHOPIFY_SYNC_SECRET in Render before installing webhooks" }); return; }
      const webhookUrl = `${getBackendWebhookBaseUrl(req)}/api/shopify/webhook?secret=${encodeURIComponent(secret)}`;
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
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/shopify/webhook", async (req, res) => {
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

  app.get("/api/admin/shopify/products", requireAdminRest, async (_req, res) => {
    try { res.json(await shopifyRequest(`/products.json?limit=20&status=active`)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.get("/api/admin/shopify/orders", requireAdminRest, async (_req, res) => {
    try { res.json(await shopifyRequest(`/orders.json?limit=20&status=any`)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.get("/api/admin/shopify/customers", requireAdminRest, async (_req, res) => {
    try { res.json(await shopifyRequest(`/customers.json?limit=20`)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.get("/api/admin/shopify/inventory", requireAdminRest, async (_req, res) => {
    try {
      const data = await shopifyRequest(`/products.json?limit=20&fields=id,title,variants`);
      res.json({ products: data.products || [] });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.get("/api/admin/shopify/webhooks", requireAdminRest, async (_req, res) => {
    try { res.json(await shopifyRequest(`/webhooks.json?limit=50`)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.get("/api/admin/shopify/sync", requireAdminRest, async (_req, res) => {
    try {
      const [productsData, ordersData, customersData, webhooksData] = await Promise.all([
        shopifyRequest(`/products.json?limit=20&status=active`),
        shopifyRequest(`/orders.json?limit=20&status=any`),
        shopifyRequest(`/customers.json?limit=20`),
        shopifyRequest(`/webhooks.json?limit=50`),
      ]);
      res.json({
        success: true,
        products: productsData,
        orders: ordersData,
        customers: customersData,
        webhooks: webhooksData,
        summary: {
          products: productsData.products?.length ?? 0,
          orders: ordersData.orders?.length ?? 0,
          customers: customersData.customers?.length ?? 0,
          webhooks: webhooksData.webhooks?.length ?? 0,
        },
      });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/admin/printify/status", requireAdminRest, async (_req, res) => {
    const creds = await getPrintifyCredentials();
    res.json({ connected: !!(creds.apiKey && creds.shopId), shopId: creds.shopId });
  });

  app.post("/api/admin/printify/credentials", requireAdminRest, async (req, res) => {
    try {
      const schema = z.object({
        apiKey: z.string().min(1).refine(value => !isLikelyUrl(value), "Use your Printify API token, not the API address"),
        shopId: z.string().min(1),
      });
      const data = schema.parse(req.body);
      await validatePrintifyCredentials(cleanEnv(data.apiKey), cleanEnv(data.shopId));
      await saveSetting("printify_disabled", "false");
      await saveSetting("printify_api_key", cleanEnv(data.apiKey));
      await saveSetting("printify_shop_id", cleanEnv(data.shopId));
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/admin/printify/products", requireAdminRest, async (_req, res) => {
    try {
      const { shopId } = await getPrintifyCredentials();
      if (!shopId) throw new Error("Printify shop ID not configured");
      res.json(await printifyRequest(`/shops/${shopId}/products.json?page=1&limit=20`));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.get("/api/admin/printify/orders", requireAdminRest, async (_req, res) => {
    try {
      const { shopId } = await getPrintifyCredentials();
      if (!shopId) throw new Error("Printify shop ID not configured");
      res.json(await printifyRequest(`/shops/${shopId}/orders.json?page=1&limit=20`));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.get("/api/admin/printify/inventory", requireAdminRest, async (_req, res) => {
    try {
      const { shopId } = await getPrintifyCredentials();
      if (!shopId) throw new Error("Printify shop ID not configured");
      const data = await printifyRequest(`/shops/${shopId}/products.json?page=1&limit=20`);
      res.json({ products: data.data || [] });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.get("/api/admin/printify/sync", requireAdminRest, async (_req, res) => {
    try {
      const { shopId } = await getPrintifyCredentials();
      if (!shopId) throw new Error("Printify shop ID not configured");
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
        summary: { ...syncResult.summary, orders: ordersData.data?.length ?? 0 },
        results: syncResult.results,
      });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.post("/api/admin/printify/webhooks/setup", requireAdminRest, async (req, res) => {
    try {
      const { shopId } = await getPrintifyCredentials();
      if (!shopId) throw new Error("Printify shop ID not configured");
      const secret = getPrintifyWebhookSecret();
      if (!secret) {
        res.status(400).json({ error: "Set PRINTIFY_WEBHOOK_SECRET or PRINTIFY_SYNC_SECRET in Render before installing webhooks" });
        return;
      }
      const webhookUrl = `${getBackendWebhookBaseUrl(req)}/api/printify/webhook?secret=${encodeURIComponent(secret)}`;
      const topics = ["product:publish:started", "product:publish:succeeded", "product:updated", "product:deleted"];
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
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.post("/api/printify/webhook", async (req, res) => {
    try {
      if (!isPrintifyWebhookAuthorized(req)) {
        res.status(401).json({ error: "Invalid Printify webhook secret" });
        return;
      }
      const payload = req.body || {};
      const topic = getPrintifyWebhookTopic(req, payload);
      const printifyProductId = getPrintifyWebhookProductId(payload);
      let result: unknown;

      if (topic.includes("deleted") && printifyProductId) result = await delistPrintifyProduct(printifyProductId);
      else if (printifyProductId) {
        result = await syncPrintifyProductToStore(printifyProductId);
        if (topic.includes("publish")) await notifyPrintifyPublishingStatus(printifyProductId, "success");
      }
      else result = await syncPrintifyStoreToWebsite();

      res.json({ success: true, topic, printifyProductId, result });
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
  app.all("/api/printify/auto-sync", async (req, res) => {
    try {
      if (!isPrintifyAutoSyncAuthorized(req)) {
        res.status(401).json({ error: "Printify auto-sync secret is missing or invalid" });
        return;
      }
      const { shopId, apiKey } = await getPrintifyCredentials();
      if (!shopId || !apiKey) throw new Error("Printify not configured");
      const syncResult = await syncPrintifyStoreToWebsite();
      res.json({ success: true, summary: syncResult.summary, results: syncResult.results });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.all("/api/admin/printify/auto-sync", async (req, res) => {
    try {
      if (!isPrintifyAutoSyncAuthorized(req)) {
        res.status(401).json({ error: "Printify auto-sync secret is missing or invalid" });
        return;
      }
      const { shopId, apiKey } = await getPrintifyCredentials();
      if (!shopId || !apiKey) throw new Error("Printify not configured");
      const syncResult = await syncPrintifyStoreToWebsite();
      res.json({ success: true, summary: syncResult.summary, results: syncResult.results });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.post("/api/admin/printify/publish", requireAdminRest, async (req, res) => {
    try {
      const schema = z.object({ printifyProductId: z.string().min(1) });
      const { printifyProductId } = schema.parse(req.body);
      const { shopId, apiKey } = await getPrintifyCredentials();
      if (!shopId || !apiKey) throw new Error("Printify not configured");
      const response = await fetch(`https://api.printify.com/v1/shops/${shopId}/products/${printifyProductId}/publish.json`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: true, description: true, images: true, variants: true, tags: true, keyFeatures: true, shipping_template: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        res.status(response.status).json({ success: false, data });
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
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
}
