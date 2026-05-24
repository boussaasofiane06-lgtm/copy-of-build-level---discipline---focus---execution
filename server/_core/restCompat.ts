import type { Express, Request, Response, NextFunction } from "express";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { products, siteSettings } from "../../drizzle/schema";
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

async function getShopifyCredentials() {
  const settings = await getSettingsMap(["shopify_store_url", "shopify_api_key"]);
  return {
    storeUrl: process.env.SHOPIFY_STORE_URL || settings.shopify_store_url || "",
    apiKey: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_API_KEY || settings.shopify_api_key || "",
  };
}

async function getPrintifyCredentials() {
  const settings = await getSettingsMap(["printify_api_key", "printify_shop_id"]);
  return {
    apiKey: cleanEnv(process.env.PRINTIFY_API_KEY || settings.printify_api_key || ""),
    shopId: cleanEnv(process.env.PRINTIFY_SHOP_ID || settings.printify_shop_id || ""),
  };
}

function normalizeShopifyUrl(storeUrl: string) {
  return storeUrl.startsWith("http") ? storeUrl : `https://${storeUrl}`;
}

async function shopifyRequest(path: string) {
  const { storeUrl, apiKey } = await getShopifyCredentials();
  if (!storeUrl || !apiKey) throw new Error("Shopify not configured");
  const response = await fetch(`${normalizeShopifyUrl(storeUrl)}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
    headers: { "X-Shopify-Access-Token": apiKey },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Shopify API error: ${response.status}`);
  return data;
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
    throw new Error(`Printify API error ${response.status}: ${message}`);
  }
  return data;
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
    .map((variant: any) => String(variant.title || "").trim())
    .filter(Boolean);
  return Array.from(new Set<string>(sizes)).slice(0, 24);
}

function getPrintifyPrice(product: any) {
  const variants = getPrintifyVariants(product);
  const firstVariant = variants.find((variant: any) => variant?.is_enabled !== false) || variants[0];
  return firstVariant ? (Number(firstVariant.price || 0) / 100).toFixed(2) : "29.99";
}

function getPrintifyInStock(product: any) {
  return getPrintifyVariants(product).some((variant: any) => variant?.is_enabled !== false && variant?.is_available !== false);
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
  const imageUrl = product.images?.[0]?.src || "";
  const sizes = getPrintifySizes(product);
  const db = await getDb();
  const existing = await db.select().from(products).where(eq(products.printifyProductId, printifyProductId)).limit(1);
  const values = {
    name: product.title || "Printify Product",
    description: product.description || "",
    price,
    category: existing[0]?.category || "mens-t-shirts",
    sizes: sizes.length ? sizes : ["S", "M", "L", "XL"],
    imageUrl,
    badge: existing[0]?.badge || (visible ? "New Release" : "Coming Soon"),
    inStock: visible && getPrintifyInStock(product),
    published: visible,
    hidden: !visible,
    delisted: !visible,
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

function isPrintifyAutoSyncAuthorized(req: Request) {
  const expectedSecret = cleanEnv(process.env.PRINTIFY_SYNC_SECRET);
  const providedSecret = cleanEnv(String(req.query.secret || req.headers["x-printify-sync-secret"] || ""));
  return !!expectedSecret && providedSecret === expectedSecret;
}

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
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

export function registerRestCompatRoutes(app: Express) {
  app.get("/api/admin/integrations/overview", requireAdminRest, async (_req, res) => {
    try {
      const settings = await getSettingsMap();
      const shopify = await getShopifyCredentials();
      const printify = await getPrintifyCredentials();
      const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
      const stripeWebhookConfigured = !!process.env.STRIPE_WEBHOOK_SECRET;
      res.json({
        generatedAt: new Date().toISOString(),
        integrations: {
          shopify: {
            connected: !!(shopify.storeUrl && shopify.apiKey),
            storeUrl: shopify.storeUrl,
            token: maskSecret(shopify.apiKey),
            capabilities: ["products", "inventory", "orders", "customers", "webhooks"],
          },
          printify: {
            connected: !!(printify.apiKey && printify.shopId),
            shopId: printify.shopId,
            token: maskSecret(printify.apiKey),
            capabilities: ["publishing", "fulfillment", "orders", "inventory"],
          },
          stripe: {
            connected: stripeConfigured,
            webhookConfigured: stripeWebhookConfigured,
            key: maskSecret(process.env.STRIPE_SECRET_KEY),
            capabilities: ["payments", "transactions", "webhooks", "financial reporting"],
          },
          tidio: {
            enabled: settings.tidio_enabled === "true",
            configured: !!normalizeTidioPublicKey(settings.tidio_public_key || process.env.TIDIO_PUBLIC_KEY),
            publicKey: maskSecret(normalizeTidioPublicKey(settings.tidio_public_key || process.env.TIDIO_PUBLIC_KEY)),
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
      res.json({
        enabled: settings.tidio_enabled === "true",
        publicKey: normalizeTidioPublicKey(settings.tidio_public_key || process.env.TIDIO_PUBLIC_KEY || ""),
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
      const publicKey = normalizeTidioPublicKey(settings.tidio_public_key || process.env.TIDIO_PUBLIC_KEY || "");
      res.json({
        enabled: settings.tidio_enabled === "true" && !!publicKey,
        publicKey,
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
        const publicKey = normalizeTidioPublicKey(settings.tidio_public_key || process.env.TIDIO_PUBLIC_KEY);
        res.json({ ok: !!publicKey, message: publicKey ? "Tidio public key configured" : "Tidio public key missing" });
        return;
      }
      res.status(404).json({ error: "Unsupported provider" });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
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
      await saveSetting("shopify_store_url", data.storeUrl);
      await saveSetting("shopify_api_key", data.apiKey);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
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
      await saveSetting("printify_api_key", data.apiKey);
      await saveSetting("printify_shop_id", data.shopId);
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
      const ordersData = await printifyRequest(`/shops/${shopId}/orders.json?page=1&limit=20`);
      res.json({
        success: true,
        products: { data: syncResult.products },
        orders: ordersData,
        summary: { ...syncResult.summary, orders: ordersData.data?.length ?? 0 },
        results: syncResult.results,
      });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
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
      const storeProduct = await syncPrintifyProductToStore(printifyProductId);
      res.json({ success: true, data, storeProduct });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
}
