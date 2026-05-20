import { Router } from "express";
import { eq, asc, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { products, blogPosts, digitalProducts, digitalPurchases, affiliateProducts, membershipTiers, siteSettings } from "../db/schema.js";
import { getProtectedDownloadUrl } from "../storage/objectStorage.js";

const router = Router();

// ─── Products ─────────────────────────────────────────────────────────────────
router.get("/products", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.published, true), eq(products.hidden, false), eq(products.delisted, false)))
      .orderBy(asc(products.sortOrder), asc(products.createdAt));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const db = await getDb();
    const [row] = await db.select().from(products).where(eq(products.id, parseInt(req.params.id))).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
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

    let url = product.fileUrl || "";
    if (product.fileKey) url = await getProtectedDownloadUrl(product.fileKey);
    if (!url) { res.status(404).json({ error: "No downloadable file configured" }); return; }

    await db.update(digitalPurchases).set({ downloadedAt: new Date() }).where(eq(digitalPurchases.id, purchase.id));
    res.json({
      url,
      fileName: product.fileName,
      productName: product.name,
      expiresInSeconds: Number(process.env.DOWNLOAD_URL_TTL_SECONDS || 900),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
