import {
  boolean,
  decimal,
  integer,
  json,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: decimal("compareAtPrice", { precision: 10, scale: 2 }),
  category: varchar("category", { length: 64 }).notNull().default("apparel"),
  sizes: json("sizes").$type<string[]>().notNull().default(["S", "M", "L", "XL", "XXL"]),
  imageUrl: text("imageUrl"),
  badge: varchar("badge", { length: 64 }),
  inStock: boolean("inStock").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  sortOrder: integer("sortOrder").notNull().default(0),
  shopifyVariantId: varchar("shopifyVariantId", { length: 128 }),
  shopifyProductId: varchar("shopifyProductId", { length: 128 }),
  printifyProductId: varchar("printifyProductId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SiteSetting = typeof siteSettings.$inferSelect;

export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  imageUrl: text("imageUrl"),
  category: varchar("category", { length: 64 }).notNull().default("mindset"),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

export const productTypeEnum = pgEnum("product_type", ["pdf", "audiobook", "video", "other"]);

export const digitalProducts = pgTable("digital_products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  category: varchar("category", { length: 64 }).notNull().default("guide"),
  productType: productTypeEnum("productType").notNull().default("pdf"),
  imageUrl: text("imageUrl"),
  fileKey: text("fileKey"),
  fileUrl: text("fileUrl"),
  fileName: varchar("fileName", { length: 255 }),
  audioUrl: text("audioUrl"),
  duration: varchar("duration", { length: 32 }),
  badge: varchar("badge", { length: 64 }),
  published: boolean("published").notNull().default(false),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DigitalProduct = typeof digitalProducts.$inferSelect;
export type InsertDigitalProduct = typeof digitalProducts.$inferInsert;

export const digitalPurchases = pgTable("digital_purchases", {
  id: serial("id").primaryKey(),
  productId: integer("productId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 128 }),
  downloadToken: varchar("downloadToken", { length: 128 }).notNull().unique(),
  downloadedAt: timestamp("downloadedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DigitalPurchase = typeof digitalPurchases.$inferSelect;
export type InsertDigitalPurchase = typeof digitalPurchases.$inferInsert;

export const aiVideos = pgTable("ai_videos", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  videoUrl: text("videoUrl"),
  thumbnailUrl: text("thumbnailUrl"),
  category: varchar("category", { length: 64 }).notNull().default("motivation"),
  duration: varchar("duration", { length: 32 }),
  badge: varchar("badge", { length: 64 }),
  published: boolean("published").notNull().default(false),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type AiVideo = typeof aiVideos.$inferSelect;
export type InsertAiVideo = typeof aiVideos.$inferInsert;

export const affiliateProducts = pgTable("affiliate_products", {
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
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type AffiliateProduct = typeof affiliateProducts.$inferSelect;
export type InsertAffiliateProduct = typeof affiliateProducts.$inferInsert;

export const intervalEnum = pgEnum("interval_type", ["monthly", "yearly"]);

export const membershipTiers = pgTable("membership_tiers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  interval: intervalEnum("interval").notNull().default("monthly"),
  features: json("features").$type<string[]>().notNull().default([]),
  badge: varchar("badge", { length: 64 }),
  stripePriceId: varchar("stripePriceId", { length: 128 }),
  published: boolean("published").notNull().default(false),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type MembershipTier = typeof membershipTiers.$inferSelect;
export type InsertMembershipTier = typeof membershipTiers.$inferInsert;

export const translationStatusEnum = pgEnum("translation_status", [
  "pending", "translating", "generating_audio", "ready", "error"
]);

export const digitalProductTranslations = pgTable("digital_product_translations", {
  id: serial("id").primaryKey(),
  productId: integer("productId").notNull(),
  language: varchar("language", { length: 8 }).notNull(),
  languageName: varchar("languageName", { length: 64 }).notNull(),
  status: translationStatusEnum("status").notNull().default("pending"),
  translatedText: text("translatedText"),
  pdfUrl: text("pdfUrl"),
  audioUrl: text("audioUrl"),
  audioDuration: varchar("audioDuration", { length: 32 }),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DigitalProductTranslation = typeof digitalProductTranslations.$inferSelect;
export type InsertDigitalProductTranslation = typeof digitalProductTranslations.$inferInsert;
