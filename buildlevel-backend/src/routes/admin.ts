import { Router, Request, Response } from "express";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";
import multer from "multer";
import { getDb } from "../db/index.js";
import {
  products, blogPosts, digitalProducts, affiliateProducts,
  membershipTiers, siteSettings, aiVideos
} from "../db/schema.js";
import { requireAdmin, verifyAdminPassword, signAdminToken, ADMIN_COOKIE } from "../middleware/adminAuth.js";
import { ALLOWED_IMAGE_EXTENSIONS, ALLOWED_UPLOAD_EXTENSIONS, MAX_DIGITAL_FILE_SIZE_BYTES, uploadObject } from "../storage/objectStorage.js";

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
  fileKey: z.string().optional().nullable(),
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
      fileKey: data.fileKey,
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

router.get("/digital/upload-config", requireAdmin, (req: Request, res: Response) => {
  res.json({
    maxDigitalFileSizeBytes: MAX_DIGITAL_FILE_SIZE_BYTES,
    allowedFileTypes: ALLOWED_UPLOAD_EXTENSIONS,
    allowedThumbnailTypes: ALLOWED_IMAGE_EXTENSIONS,
    storage: {
      configured: !!(process.env.UPLOAD_BUCKET || process.env.R2_BUCKET || process.env.S3_BUCKET),
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

// ─── Integration Management ───────────────────────────────────────────────────
router.get("/integrations/overview", requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = await getSettingsMap(integrationSettingKeys);
    const { storeUrl, apiKey: shopifyApiKey } = await getShopifyCredentials();
    const { apiKey: printifyApiKey, shopId: printifyShopId } = await getPrintifyCredentials();
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    const stripeWebhookConfigured = !!process.env.STRIPE_WEBHOOK_SECRET;

    res.json({
      generatedAt: new Date().toISOString(),
      integrations: {
        shopify: {
          connected: !!(storeUrl && shopifyApiKey),
          storeUrl,
          token: maskSecret(shopifyApiKey),
          capabilities: ["products", "inventory", "orders", "customers", "webhooks"],
        },
        printify: {
          connected: !!(printifyApiKey && printifyShopId),
          shopId: printifyShopId,
          token: maskSecret(printifyApiKey),
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
          configured: !!normalizeTidioPublicKey(settings.tidio_public_key),
          publicKey: maskSecret(normalizeTidioPublicKey(settings.tidio_public_key)),
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
    res.json({
      enabled: settings.tidio_enabled === "true",
      publicKey: normalizeTidioPublicKey(settings.tidio_public_key || ""),
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
    const provider = req.params.provider;
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
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      res.json({ ok: response.ok, status: response.status, message: response.ok ? "Printify connected" : "Printify connection failed" });
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
      const publicKey = normalizeTidioPublicKey(settings.tidio_public_key);
      res.json({ ok: !!publicKey, message: publicKey ? "Tidio public key configured" : "Tidio public key missing" });
      return;
    }
    res.status(404).json({ error: "Unsupported provider" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Printify Proxy ───────────────────────────────────────────────────────────
// Proxies requests to Printify API using stored credentials
async function getPrintifyCredentials() {
  const db = await getDb();
  const rows = await db.select().from(siteSettings)
    .where(eq(siteSettings.key, 'printify_api_key'));
  const shopRows = await db.select().from(siteSettings)
    .where(eq(siteSettings.key, 'printify_shop_id'));
  return {
    apiKey: process.env.PRINTIFY_API_KEY || rows[0]?.value || '',
    shopId: process.env.PRINTIFY_SHOP_ID || shopRows[0]?.value || '',
  };
}

router.get("/printify/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, shopId } = await getPrintifyCredentials();
    res.json({ connected: !!(apiKey && shopId), shopId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/printify/credentials", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, shopId } = req.body;
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
    const page = parseInt(req.query.page as string) || 1;
    const r = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json?page=${page}&limit=20`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await r.json();
    res.json(data);
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
    res.status(r.ok ? 200 : r.status).json({ success: r.ok, data });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/printify/sync", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, shopId } = await getPrintifyCredentials();
    if (!apiKey || !shopId) { res.status(400).json({ error: 'Printify not configured' }); return; }
    const [productsResponse, ordersResponse] = await Promise.all([
      fetch(`https://api.printify.com/v1/shops/${shopId}/products.json?page=1&limit=20`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      fetch(`https://api.printify.com/v1/shops/${shopId}/orders.json?page=1&limit=20`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    ]);
    const [productsData, ordersData] = await Promise.all([
      productsResponse.json(),
      ordersResponse.json(),
    ]);
    res.json({
      success: productsResponse.ok && ordersResponse.ok,
      products: productsData,
      orders: ordersData,
      summary: {
        products: productsData?.data?.length ?? 0,
        orders: ordersData?.data?.length ?? 0,
      },
    });
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
  const db = await getDb();
  const urlRows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'shopify_store_url'));
  const keyRows = await db.select().from(siteSettings).where(eq(siteSettings.key, 'shopify_api_key'));
  return {
    storeUrl: process.env.SHOPIFY_STORE_URL || urlRows[0]?.value || '',
    apiKey: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_API_KEY || keyRows[0]?.value || '',
  };
}

function normalizeShopifyUrl(storeUrl: string) {
  return storeUrl.startsWith('http') ? storeUrl : `https://${storeUrl}`;
}

router.get("/shopify/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = await getShopifyCredentials();
    res.json({ connected: !!(storeUrl && apiKey), storeUrl });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/shopify/credentials", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { storeUrl, apiKey } = req.body;
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

export default router;

