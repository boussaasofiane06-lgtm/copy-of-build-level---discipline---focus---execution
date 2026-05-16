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

// ─── Site Settings ────────────────────────────────────────────────────────────
export const siteSettings = mysqlTable("site_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SiteSetting = typeof siteSettings.$inferSelect;
