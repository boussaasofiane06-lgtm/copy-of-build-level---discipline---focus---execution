import { Router } from "express";
import { eq, asc, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { products, blogPosts, digitalProducts, affiliateProducts, membershipTiers } from "../db/schema.js";

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

export default router;
