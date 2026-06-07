import {
  mysqlTable,
  serial,
  varchar,
  text,
  int,
  boolean,
  decimal,
  timestamp,
  json,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

// ─── Physical Products ────────────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: decimal("compareAtPrice", { precision: 10, scale: 2 }),
  category: varchar("category", { length: 64 }).notNull().default("apparel"),
  sizes: json("sizes").$type<string[]>().notNull().default([]),
  imageUrl: text("imageUrl"),
  badge: varchar("badge", { length: 64 }),
  inStock: boolean("inStock").notNull().default(true),
  published: boolean("published").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  delisted: boolean("delisted").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  sortOrder: int("sortOrder").notNull().default(0),
  shopifyVariantId: varchar("shopifyVariantId", { length: 128 }),
  shopifyProductId: varchar("shopifyProductId", { length: 128 }),
  printifyProductId: varchar("printifyProductId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Blog Posts ───────────────────────────────────────────────────────────────
export const blogPosts = mysqlTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content"),
  imageUrl: text("imageUrl"),
  category: varchar("category", { length: 64 }).notNull().default("mindset"),
  readTime: varchar("readTime", { length: 32 }),
  published: boolean("published").notNull().default(false),
  scheduledAt: timestamp("scheduledAt"),
  featured: boolean("featured").notNull().default(false),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

// ─── Digital Products ─────────────────────────────────────────────────────────
export const digitalProducts = mysqlTable("digital_products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  category: varchar("category", { length: 64 }).notNull().default("guide"),
  productType: mysqlEnum("productType", ["pdf", "audiobook", "video", "other"]).notNull().default("pdf"),
  imageUrl: text("imageUrl"),
  fileKey: text("fileKey"),
  fileUrl: text("fileUrl"),
  fileName: varchar("fileName", { length: 255 }),
  audioUrl: text("audioUrl"),
  duration: varchar("duration", { length: 32 }),
  badge: varchar("badge", { length: 64 }),
  stripePaymentLink: text("stripePaymentLink"),
  published: boolean("published").notNull().default(false),
  scheduledAt: timestamp("scheduledAt"),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DigitalProduct = typeof digitalProducts.$inferSelect;
export type InsertDigitalProduct = typeof digitalProducts.$inferInsert;

// ─── Digital Purchases ────────────────────────────────────────────────────────
export const digitalPurchases = mysqlTable("digital_purchases", {
  id: serial("id").primaryKey(),
  productId: int("productId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 128 }),
  downloadToken: varchar("downloadToken", { length: 128 }).notNull().unique(),
  downloadedAt: timestamp("downloadedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DigitalPurchase = typeof digitalPurchases.$inferSelect;
export type InsertDigitalPurchase = typeof digitalPurchases.$inferInsert;

// ─── Affiliate Products ───────────────────────────────────────────────────────
export const affiliateProducts = mysqlTable("affiliate_products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }),
  affiliateUrl: text("affiliateUrl").notNull(),
  imageUrl: text("imageUrl"),
  category: varchar("category", { length: 64 }).notNull().default("gear"),
  brand: varchar("brand", { length: 128 }),
  badge: varchar("badge", { length: 64 }),
  commission: varchar("commission", { length: 32 }),
  published: boolean("published").notNull().default(false),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type AffiliateProduct = typeof affiliateProducts.$inferSelect;
export type InsertAffiliateProduct = typeof affiliateProducts.$inferInsert;

// ─── Membership Tiers ─────────────────────────────────────────────────────────
export const membershipTiers = mysqlTable("membership_tiers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  interval: mysqlEnum("interval", ["monthly", "yearly"]).notNull().default("monthly"),
  features: json("features").$type<string[]>().notNull().default([]),
  badge: varchar("badge", { length: 64 }),
  stripePriceId: varchar("stripePriceId", { length: 128 }),
  published: boolean("published").notNull().default(false),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type MembershipTier = typeof membershipTiers.$inferSelect;
export type InsertMembershipTier = typeof membershipTiers.$inferInsert;

// ─── AI Videos ──────────────────────────────────────────────────────────────────
export const aiVideos = mysqlTable("ai_videos", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  videoUrl: text("videoUrl").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  category: varchar("category", { length: 64 }).notNull().default("training"),
  duration: varchar("duration", { length: 32 }),
  published: boolean("published").notNull().default(false),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type AiVideo = typeof aiVideos.$inferSelect;
export type InsertAiVideo = typeof aiVideos.$inferInsert;

// ─── Site Settings ────────────────────────────────────────────────────────────
export const siteSettings = mysqlTable("site_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SiteSetting = typeof siteSettings.$inferSelect;

// ─── Engagement / Reviews / Moderation ────────────────────────────────────────
export const reviews = mysqlTable("reviews", {
  id: serial("id").primaryKey(),
  targetType: mysqlEnum("targetType", ["site", "product", "digital"]).notNull().default("site"),
  targetId: int("targetId"),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }),
  rating: int("rating").notNull(),
  reviewText: text("reviewText").notNull(),
  avatarUrl: text("avatarUrl"),
  verifiedPurchase: boolean("verifiedPurchase").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "hidden", "spam", "blocked"]).notNull().default("pending"),
  ipAddress: varchar("ipAddress", { length: 128 }),
  sessionId: varchar("sessionId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Review = typeof reviews.$inferSelect;

export const blogLikes = mysqlTable("blog_likes", {
  id: serial("id").primaryKey(),
  postId: int("postId").notNull(),
  sessionId: varchar("sessionId", { length: 128 }).notNull(),
  ipAddress: varchar("ipAddress", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BlogLike = typeof blogLikes.$inferSelect;

export const blogComments = mysqlTable("blog_comments", {
  id: serial("id").primaryKey(),
  postId: int("postId").notNull(),
  parentId: int("parentId"),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  comment: text("comment").notNull(),
  adminReply: boolean("adminReply").notNull().default(false),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "hidden", "spam", "blocked"]).notNull().default("pending"),
  ipAddress: varchar("ipAddress", { length: 128 }),
  sessionId: varchar("sessionId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type BlogComment = typeof blogComments.$inferSelect;

export const blogRatings = mysqlTable("blog_ratings", {
  id: serial("id").primaryKey(),
  postId: int("postId").notNull(),
  rating: int("rating").notNull(),
  sessionId: varchar("sessionId", { length: 128 }).notNull(),
  ipAddress: varchar("ipAddress", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BlogRating = typeof blogRatings.$inferSelect;

export const blockedUsers = mysqlTable("blocked_users", {
  id: serial("id").primaryKey(),
  blockType: mysqlEnum("blockType", ["email", "ip", "session"]).notNull(),
  value: varchar("value", { length: 320 }).notNull(),
  reason: text("reason"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type BlockedUser = typeof blockedUsers.$inferSelect;

export const moderationLogs = mysqlTable("moderation_logs", {
  id: serial("id").primaryKey(),
  targetType: mysqlEnum("targetType", ["review", "comment", "rating", "like", "blocked_user"]).notNull(),
  targetId: int("targetId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  details: text("details"),
  moderator: varchar("moderator", { length: 160 }).default("admin"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ModerationLog = typeof moderationLogs.$inferSelect;

// ─── Orders / Fulfillment Safety Ledger ───────────────────────────────────────
export const productVariants = mysqlTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: int("productId").notNull(),
  source: mysqlEnum("source", ["manual", "printify", "shopify"]).notNull().default("manual"),
  printifyProductId: varchar("printifyProductId", { length: 128 }),
  printifyVariantId: varchar("printifyVariantId", { length: 128 }),
  shopifyProductId: varchar("shopifyProductId", { length: 128 }),
  shopifyVariantId: varchar("shopifyVariantId", { length: 128 }),
  label: varchar("label", { length: 255 }).notNull(),
  size: varchar("size", { length: 128 }),
  color: varchar("color", { length: 128 }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  available: boolean("available").notNull().default(true),
  enabled: boolean("enabled").notNull().default(true),
  printProviderId: varchar("printProviderId", { length: 128 }),
  blueprintId: varchar("blueprintId", { length: 128 }),
  imageUrl: text("imageUrl"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ProductVariant = typeof productVariants.$inferSelect;

export const orders = mysqlTable("orders", {
  id: serial("id").primaryKey(),
  customerName: varchar("customerName", { length: 255 }),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 64 }),
  shippingAddress: json("shippingAddress").$type<Record<string, unknown>>(),
  stripeEventId: varchar("stripeEventId", { length: 128 }),
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 128 }),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 128 }),
  stripePaymentStatus: varchar("stripePaymentStatus", { length: 64 }),
  orderTotal: decimal("orderTotal", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 8 }).default("usd"),
  orderType: mysqlEnum("orderType", ["apparel", "digital", "mixed"]).notNull().default("apparel"),
  fulfillmentStatus: mysqlEnum("fulfillmentStatus", ["Payment Pending", "Paid", "Awaiting Fulfillment", "Processing", "Printify Order Created", "Awaiting Production Approval", "Sent to Production", "Requires Admin Review", "Failed", "Cancelled", "Shipped", "Delivered"]).notNull().default("Payment Pending"),
  printifyOrderId: varchar("printifyOrderId", { length: 128 }),
  printifyExternalId: varchar("printifyExternalId", { length: 128 }),
  printifyStatus: varchar("printifyStatus", { length: 128 }),
  printifyApiResponse: json("printifyApiResponse").$type<Record<string, unknown>>(),
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").notNull().default(0),
  processing: boolean("processing").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Order = typeof orders.$inferSelect;

export const orderItems = mysqlTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: int("orderId").notNull(),
  productId: int("productId"),
  productName: varchar("productName", { length: 255 }).notNull(),
  productType: mysqlEnum("productType", ["apparel", "digital"]).notNull().default("apparel"),
  quantity: int("quantity").notNull().default(1),
  selectedSize: varchar("selectedSize", { length: 255 }),
  selectedColor: varchar("selectedColor", { length: 128 }),
  printifyProductId: varchar("printifyProductId", { length: 128 }),
  printifyVariantId: varchar("printifyVariantId", { length: 128 }),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }),
  fulfillmentSource: mysqlEnum("fulfillmentSource", ["printify", "digital", "manual", "none"]).notNull().default("none"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OrderItem = typeof orderItems.$inferSelect;

export const fulfillmentAttempts = mysqlTable("fulfillment_attempts", {
  id: serial("id").primaryKey(),
  orderId: int("orderId").notNull(),
  attemptNumber: int("attemptNumber").notNull().default(1),
  action: varchar("action", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["pending", "success", "failed", "skipped"]).notNull().default("pending"),
  requestPayload: json("requestPayload").$type<Record<string, unknown>>(),
  responsePayload: json("responsePayload").$type<Record<string, unknown>>(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FulfillmentAttempt = typeof fulfillmentAttempts.$inferSelect;

export const orderEvents = mysqlTable("order_events", {
  id: serial("id").primaryKey(),
  orderId: int("orderId"),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  stripeEventId: varchar("stripeEventId", { length: 128 }),
  printifyEventId: varchar("printifyEventId", { length: 128 }),
  payload: json("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OrderEvent = typeof orderEvents.$inferSelect;
