import { Router } from "express";
import { eq, asc, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { products, blogPosts, digitalProducts, digitalPurchases, affiliateProducts, membershipTiers, siteSettings } from "../db/schema.js";
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

// ─── Products ─────────────────────────────────────────────────────────────────
router.get("/products", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.published, true), eq(products.hidden, false), eq(products.delisted, false)))
      .orderBy(asc(products.sortOrder), asc(products.createdAt));
    res.json(rows.map(cleanProductDescriptionForResponse));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const db = await getDb();
    const [row] = await db.select().from(products).where(eq(products.id, parseInt(req.params.id))).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(cleanProductDescriptionForResponse(row));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Blog ─────────────────────────────────────────────────────────────────────
router.get("/blog", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.published, true))
      .orderBy(asc(blogPosts.sortOrder), asc(blogPosts.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/blog/:slug", async (req, res) => {
  try {
    const db = await getDb();
    const [row] = await db.select().from(blogPosts).where(eq(blogPosts.slug, req.params.slug)).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Digital Products ─────────────────────────────────────────────────────────
router.get("/digital", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(digitalProducts)
      .where(eq(digitalProducts.published, true))
      .orderBy(asc(digitalProducts.sortOrder), asc(digitalProducts.createdAt));
    res.json(rows);
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

    await db.update(digitalPurchases).set({ downloadedAt: new Date() }).where(eq(digitalPurchases.id, purchase.id));
    await saveSetting(purchaseDownloadCountKey(purchase.id), String(count + 1));
    res.redirect(302, url);
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
