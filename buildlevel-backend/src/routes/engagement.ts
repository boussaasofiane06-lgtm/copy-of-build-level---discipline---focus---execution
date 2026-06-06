import { Router, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import {
  blogComments,
  blogLikes,
  blogPosts,
  blogRatings,
  blockedUsers,
  moderationLogs,
  reviews,
  siteSettings,
} from "../db/schema.js";
import { requireAdmin } from "../middleware/adminAuth.js";

const router = Router();
const commentRateLimit = new Map<string, number[]>();

function getClientIp(req: Request) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

function getSessionId(req: Request) {
  return String(req.headers["x-buildlevel-session"] || req.body?.sessionId || req.query.sessionId || "").slice(0, 128);
}

function sanitizeText(value: string, max = 5000) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

function isAllowedStatus(value: string) {
  return ["pending", "approved", "rejected", "hidden", "spam", "blocked"].includes(value);
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

async function getSettings() {
  const db = await getDb();
  const rows = await db.select().from(siteSettings);
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value || "";
  return settings;
}

async function ensureEngagementTables() {
  const db = await getDb();
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      targetType ENUM('site','product','digital') NOT NULL DEFAULT 'site',
      targetId INT NULL,
      customerName VARCHAR(160) NOT NULL,
      email VARCHAR(320) NULL,
      rating INT NOT NULL,
      reviewText TEXT NOT NULL,
      avatarUrl TEXT NULL,
      verifiedPurchase BOOLEAN NOT NULL DEFAULT false,
      featured BOOLEAN NOT NULL DEFAULT false,
      status ENUM('pending','approved','rejected','hidden','spam','blocked') NOT NULL DEFAULT 'pending',
      ipAddress VARCHAR(128) NULL,
      sessionId VARCHAR(128) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS blog_likes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      postId INT NOT NULL,
      sessionId VARCHAR(128) NOT NULL,
      ipAddress VARCHAR(128) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS blog_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      postId INT NOT NULL,
      parentId INT NULL,
      name VARCHAR(160) NOT NULL,
      email VARCHAR(320) NOT NULL,
      comment TEXT NOT NULL,
      adminReply BOOLEAN NOT NULL DEFAULT false,
      status ENUM('pending','approved','rejected','hidden','spam','blocked') NOT NULL DEFAULT 'pending',
      ipAddress VARCHAR(128) NULL,
      sessionId VARCHAR(128) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS blog_ratings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      postId INT NOT NULL,
      rating INT NOT NULL,
      sessionId VARCHAR(128) NOT NULL,
      ipAddress VARCHAR(128) NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      blockType ENUM('email','ip','session') NOT NULL,
      value VARCHAR(320) NOT NULL,
      reason TEXT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS moderation_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      targetType ENUM('review','comment','rating','like','blocked_user') NOT NULL,
      targetId INT NOT NULL,
      action VARCHAR(64) NOT NULL,
      details TEXT NULL,
      moderator VARCHAR(160) DEFAULT 'admin',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
}

async function logModeration(targetType: "review" | "comment" | "rating" | "like" | "blocked_user", targetId: number, action: string, details?: string) {
  const db = await getDb();
  await db.insert(moderationLogs).values({ targetType, targetId, action, details, moderator: "admin", createdAt: new Date() });
}

async function isBlocked(req: Request, email?: string) {
  const db = await getDb();
  const ip = getClientIp(req);
  const sessionId = getSessionId(req);
  const blocks = await db.select().from(blockedUsers).where(eq(blockedUsers.active, true));
  return blocks.some(block =>
    (block.blockType === "email" && email && block.value.toLowerCase() === email.toLowerCase()) ||
    (block.blockType === "ip" && ip && block.value === ip) ||
    (block.blockType === "session" && sessionId && block.value === sessionId)
  );
}

async function detectSpam(text: string) {
  const settings = await getSettings();
  const words = (settings.engagement_banned_words || "spam,scam,hate,kill,threat")
    .split(/[\n,]+/)
    .map(word => word.trim().toLowerCase())
    .filter(Boolean);
  const lower = text.toLowerCase();
  return words.some(word => lower.includes(word));
}

function rateLimitComment(req: Request) {
  const key = `${getClientIp(req)}:${getSessionId(req) || "anon"}`;
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const history = (commentRateLimit.get(key) || []).filter(time => now - time < windowMs);
  if (history.length >= 5) return false;
  history.push(now);
  commentRateLimit.set(key, history);
  return true;
}

function nestComments(rows: typeof blogComments.$inferSelect[]) {
  const byId = new Map<number, any>();
  const roots: any[] = [];
  for (const row of rows) byId.set(row.id, { ...row, replies: [] });
  for (const row of byId.values()) {
    if (row.parentId && byId.has(row.parentId)) byId.get(row.parentId).replies.push(row);
    else roots.push(row);
  }
  return roots;
}

async function getBlogStats(postId: number, sessionId = "") {
  const db = await getDb();
  const [likes, ratings, comments, likedRows, ratedRows] = await Promise.all([
    db.select().from(blogLikes).where(eq(blogLikes.postId, postId)),
    db.select().from(blogRatings).where(eq(blogRatings.postId, postId)),
    db.select().from(blogComments).where(and(eq(blogComments.postId, postId), eq(blogComments.status, "approved"))),
    sessionId ? db.select().from(blogLikes).where(and(eq(blogLikes.postId, postId), eq(blogLikes.sessionId, sessionId))).limit(1) : Promise.resolve([]),
    sessionId ? db.select().from(blogRatings).where(and(eq(blogRatings.postId, postId), eq(blogRatings.sessionId, sessionId))).limit(1) : Promise.resolve([]),
  ]);
  const averageRating = ratings.length ? ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length : 0;
  return {
    likes: likes.length,
    liked: likedRows.length > 0,
    comments: comments.length,
    ratingAverage: Number(averageRating.toFixed(2)),
    ratingCount: ratings.length,
    userRating: ratedRows[0]?.rating || 0,
  };
}

router.use(async (_req, _res, next) => {
  try {
    await ensureEngagementTables();
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/engagement/blog/:postId", async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    const sessionId = String(req.query.sessionId || "");
    const db = await getDb();
    const approved = await db
      .select()
      .from(blogComments)
      .where(and(eq(blogComments.postId, postId), eq(blogComments.status, "approved")))
      .orderBy(desc(blogComments.createdAt));
    res.json({ ...(await getBlogStats(postId, sessionId)), commentTree: nestComments(approved) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/engagement/blog-summary", async (req, res) => {
  try {
    const ids = String(req.query.ids || "").split(",").map(id => Number(id)).filter(Boolean);
    const result: Record<string, Awaited<ReturnType<typeof getBlogStats>>> = {};
    for (const id of ids.slice(0, 50)) result[String(id)] = await getBlogStats(id, String(req.query.sessionId || ""));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/engagement/blog/:postId/like", async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    const sessionId = getSessionId(req);
    if (!sessionId) { res.status(400).json({ error: "Session ID required" }); return; }
    const db = await getDb();
    const existing = await db.select().from(blogLikes).where(and(eq(blogLikes.postId, postId), eq(blogLikes.sessionId, sessionId))).limit(1);
    if (existing.length === 0) {
      await db.insert(blogLikes).values({ postId, sessionId, ipAddress: getClientIp(req), createdAt: new Date() });
    }
    res.json(await getBlogStats(postId, sessionId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/engagement/blog/:postId/rating", async (req, res) => {
  try {
    const schema = z.object({ rating: z.number().min(1).max(5), sessionId: z.string().min(6) });
    const data = schema.parse(req.body);
    const postId = Number(req.params.postId);
    const db = await getDb();
    const existing = await db.select().from(blogRatings).where(and(eq(blogRatings.postId, postId), eq(blogRatings.sessionId, data.sessionId))).limit(1);
    if (existing.length === 0) await db.insert(blogRatings).values({ postId, rating: data.rating, sessionId: data.sessionId, ipAddress: getClientIp(req), createdAt: new Date() });
    res.json({ success: true, ...(await getBlogStats(postId, data.sessionId)), message: "Thank you for your feedback" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/engagement/blog/:postId/comments", async (req, res) => {
  try {
    if (!rateLimitComment(req)) { res.status(429).json({ error: "Please wait before commenting again" }); return; }
    const schema = z.object({
      name: z.string().min(1).max(160),
      email: z.string().email().max(320),
      comment: z.string().min(2).max(5000),
      parentId: z.number().optional().nullable(),
      sessionId: z.string().optional().default(""),
    });
    const data = schema.parse(req.body);
    if (await isBlocked(req, data.email)) { res.status(403).json({ error: "Comment blocked" }); return; }
    const status = await detectSpam(data.comment) ? "spam" : "pending";
    const db = await getDb();
    await db.insert(blogComments).values({
      postId: Number(req.params.postId),
      parentId: data.parentId || null,
      name: sanitizeText(data.name, 160),
      email: data.email.toLowerCase(),
      comment: sanitizeText(data.comment),
      status,
      ipAddress: getClientIp(req),
      sessionId: data.sessionId || getSessionId(req),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.json({ success: true, status, message: "Thank you! Your comment has been submitted." });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/reviews", async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(reviews).where(eq(reviews.status, "approved")).orderBy(desc(reviews.createdAt));
    const targetType = String(req.query.targetType || "");
    const targetId = Number(req.query.targetId || 0);
    const filtered = rows
      .filter(row => !targetType || row.targetType === targetType)
      .filter(row => !targetId || row.targetId === targetId)
      .filter(row => req.query.featured !== "true" || row.featured)
      .slice(0, Number(req.query.limit || 20));
    const average = filtered.length ? filtered.reduce((sum, row) => sum + row.rating, 0) / filtered.length : 0;
    res.json({ reviews: filtered, averageRating: Number(average.toFixed(2)), count: filtered.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/reviews", async (req, res) => {
  try {
    const schema = z.object({
      targetType: z.enum(["site", "product", "digital"]).default("site"),
      targetId: z.number().optional().nullable(),
      customerName: z.string().min(1).max(160),
      email: z.string().email().optional().or(z.literal("")),
      rating: z.number().min(1).max(5),
      reviewText: z.string().min(2).max(5000),
      avatarUrl: z.string().url().optional().or(z.literal("")),
      sessionId: z.string().optional().default(""),
    });
    const data = schema.parse(req.body);
    if (await isBlocked(req, data.email || undefined)) { res.status(403).json({ error: "Review blocked" }); return; }
    const status = await detectSpam(data.reviewText) ? "spam" : "pending";
    const db = await getDb();
    await db.insert(reviews).values({
      targetType: data.targetType,
      targetId: data.targetId || null,
      customerName: sanitizeText(data.customerName, 160),
      email: data.email || null,
      rating: data.rating,
      reviewText: sanitizeText(data.reviewText),
      avatarUrl: data.avatarUrl || null,
      status,
      ipAddress: getClientIp(req),
      sessionId: data.sessionId || getSessionId(req),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.json({ success: true, status, message: "Thank you for your feedback." });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get("/admin/engagement/analytics", requireAdmin, async (_req, res) => {
  try {
    const db = await getDb();
    const [likes, comments, ratings, reviewRows, posts] = await Promise.all([
      db.select().from(blogLikes),
      db.select().from(blogComments),
      db.select().from(blogRatings),
      db.select().from(reviews),
      db.select().from(blogPosts),
    ]);
    const postById = new Map(posts.map(post => [post.id, post]));
    const byCount = (ids: number[]) => ids.reduce<Record<number, number>>((acc, id) => ({ ...acc, [id]: (acc[id] || 0) + 1 }), {});
    const likeCounts = byCount(likes.map(row => row.postId));
    const commentCounts = byCount(comments.map(row => row.postId));
    const ratingScores = ratings.reduce<Record<number, { total: number; count: number }>>((acc, row) => {
      acc[row.postId] = acc[row.postId] || { total: 0, count: 0 };
      acc[row.postId].total += row.rating;
      acc[row.postId].count += 1;
      return acc;
    }, {});
    const topPost = (counts: Record<number, number>) => {
      const id = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 0);
      return id ? { id, title: postById.get(id)?.title || `Post ${id}`, count: counts[id] } : null;
    };
    const highestRated = Object.entries(ratingScores)
      .map(([id, score]) => ({ id: Number(id), title: postById.get(Number(id))?.title || `Post ${id}`, rating: score.total / score.count, count: score.count }))
      .sort((a, b) => b.rating - a.rating)[0] || null;
    res.json({
      totals: { likes: likes.length, comments: comments.length, ratings: ratings.length, reviews: reviewRows.length },
      mostLikedBlog: topPost(likeCounts),
      mostCommentedBlog: topPost(commentCounts),
      highestRatedBlog: highestRated,
      recentReviews: reviewRows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8),
      recentComments: comments.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/admin/engagement/moderation", requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "");
    const db = await getDb();
    const [commentRows, reviewRows] = await Promise.all([
      db.select().from(blogComments).orderBy(desc(blogComments.createdAt)),
      db.select().from(reviews).orderBy(desc(reviews.createdAt)),
    ]);
    res.json({
      comments: commentRows.filter(row => !status || row.status === status),
      reviews: reviewRows.filter(row => !status || row.status === status),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/admin/engagement/comments/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || "");
    if (status && !isAllowedStatus(status)) { res.status(400).json({ error: "Invalid status" }); return; }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (status) patch.status = status;
    if (req.body.comment !== undefined) patch.comment = sanitizeText(String(req.body.comment));
    const db = await getDb();
    await db.update(blogComments).set(patch).where(eq(blogComments.id, id));
    await logModeration("comment", id, status || "edit", JSON.stringify(req.body));
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/admin/engagement/comments/:id/reply", requireAdmin, async (req, res) => {
  try {
    const parentId = Number(req.params.id);
    const db = await getDb();
    const [parent] = await db.select().from(blogComments).where(eq(blogComments.id, parentId)).limit(1);
    if (!parent) { res.status(404).json({ error: "Comment not found" }); return; }
    await db.insert(blogComments).values({
      postId: parent.postId,
      parentId,
      name: "Build Level",
      email: "info@thebuildlevel.com",
      comment: sanitizeText(String(req.body.comment || "")),
      adminReply: true,
      status: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await logModeration("comment", parentId, "reply");
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.patch("/admin/engagement/reviews/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || "");
    if (status && !isAllowedStatus(status)) { res.status(400).json({ error: "Invalid status" }); return; }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (status) patch.status = status;
    if (req.body.featured !== undefined) patch.featured = !!req.body.featured;
    if (req.body.reviewText !== undefined) patch.reviewText = sanitizeText(String(req.body.reviewText));
    const db = await getDb();
    await db.update(reviews).set(patch).where(eq(reviews.id, id));
    await logModeration("review", id, status || "edit", JSON.stringify(req.body));
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/admin/engagement/comments/:id", requireAdmin, async (req, res) => {
  const db = await getDb();
  const id = Number(req.params.id);
  await db.delete(blogComments).where(eq(blogComments.id, id));
  await logModeration("comment", id, "delete");
  res.json({ success: true });
});

router.delete("/admin/engagement/reviews/:id", requireAdmin, async (req, res) => {
  const db = await getDb();
  const id = Number(req.params.id);
  await db.delete(reviews).where(eq(reviews.id, id));
  await logModeration("review", id, "delete");
  res.json({ success: true });
});

router.get("/admin/engagement/settings", requireAdmin, async (_req, res) => {
  const settings = await getSettings();
  const blocks = await (await getDb()).select().from(blockedUsers).orderBy(desc(blockedUsers.createdAt));
  res.json({
    bannedWords: settings.engagement_banned_words || "spam,scam,hate,kill,threat",
    blockedUsers: blocks,
  });
});

router.post("/admin/engagement/settings", requireAdmin, async (req, res) => {
  await saveSetting("engagement_banned_words", sanitizeText(String(req.body.bannedWords || ""), 5000));
  res.json({ success: true });
});

router.post("/admin/engagement/blocked-users", requireAdmin, async (req, res) => {
  const schema = z.object({ blockType: z.enum(["email", "ip", "session"]), value: z.string().min(1), reason: z.string().optional() });
  const data = schema.parse(req.body);
  const db = await getDb();
  await db.insert(blockedUsers).values({
    blockType: data.blockType,
    value: data.value,
    reason: data.reason,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  res.json({ success: true });
});

router.patch("/admin/engagement/blocked-users/:id", requireAdmin, async (req, res) => {
  const db = await getDb();
  const id = Number(req.params.id);
  await db.update(blockedUsers).set({ active: !!req.body.active, updatedAt: new Date() }).where(eq(blockedUsers.id, id));
  await logModeration("blocked_user", id, req.body.active ? "restore" : "disable");
  res.json({ success: true });
});

router.post("/admin/engagement/reviews", requireAdmin, async (req, res) => {
  const schema = z.object({
    targetType: z.enum(["site", "product", "digital"]).default("site"),
    targetId: z.number().optional().nullable(),
    customerName: z.string().min(1),
    email: z.string().optional().default(""),
    rating: z.number().min(1).max(5),
    reviewText: z.string().min(2),
    avatarUrl: z.string().optional().default(""),
    featured: z.boolean().default(false),
    verifiedPurchase: z.boolean().default(false),
    status: z.enum(["pending", "approved", "rejected", "hidden", "spam", "blocked"]).default("approved"),
  });
  const data = schema.parse(req.body);
  await (await getDb()).insert(reviews).values({
    targetType: data.targetType,
    targetId: data.targetId || null,
    customerName: sanitizeText(data.customerName, 160),
    email: data.email || null,
    rating: data.rating,
    reviewText: sanitizeText(data.reviewText),
    avatarUrl: data.avatarUrl || null,
    featured: data.featured,
    verifiedPurchase: data.verifiedPurchase,
    status: data.status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  res.json({ success: true });
});

export default router;
