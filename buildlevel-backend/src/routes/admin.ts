import { Router, Request, Response } from "express";
import { eq, asc, desc } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";
import multer from "multer";
import { getDb } from "../db/index.js";
import {
  products, blogPosts, digitalProducts, affiliateProducts,
  membershipTiers, siteSettings, aiVideos
} from "../db/schema.js";
import { requireAdmin, verifyAdminPassword, signAdminToken, ADMIN_COOKIE } from "../middleware/adminAuth.js";
import { ALLOWED_IMAGE_EXTENSIONS, MAX_DIGITAL_FILE_SIZE_BYTES, isStorageConfigured, uploadObject } from "../storage/objectStorage.js";

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
  sortOrder: z.number().default(0),
});

function getDigitalLimitKey(productId: number) {
  return `digital_product_${productId}_download_limit`;
}

function getDigitalExpiryDaysKey(productId: number) {
  return `digital_product_${productId}_expires_days`;
}

async function saveDigitalAccessSettings(productId: number, data: { downloadLimit?: number; accessExpiresDays?: number }) {
  if (data.downloadLimit !== undefined) await saveSetting(getDigitalLimitKey(productId), String(data.downloadLimit));
  if (data.accessExpiresDays !== undefined) await saveSetting(getDigitalExpiryDaysKey(productId), String(data.accessExpiresDays));
}

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
    const id = parseInt(req.params.id as string);
    const data = digitalSchema.partial().parse(req.body);
    const db = await getDb();
    const { downloadLimit, accessExpiresDays, ...productData } = data;
    const updateData: Record<string, unknown> = { ...productData, updatedAt: new Date() };
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
  return (process.env.PRINTIFY_WEBHOOK_SECRET || process.env.PRINTIFY_SYNC_SECRET || "").trim();
}

function isPrintifyWebhookAuthorized(req: Request) {
  const expected = getPrintifyWebhookSecret();
  if (!expected) return true;
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
    let result: unknown;

    if (topic.includes("deleted") && printifyProductId) {
      result = await delistPrintifyProduct(printifyProductId);
    } else if (printifyProductId) {
      result = await syncPrintifyProductToStore(printifyProductId);
      if (topic.includes("publish")) {
        await notifyPrintifyPublishingStatus(printifyProductId, "success");
      }
    } else {
      result = await syncPrintifyStoreToWebsite();
    }

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

export default router;

