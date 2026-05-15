CREATE TYPE "public"."interval_type" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('pdf', 'audiobook', 'video', 'other');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."translation_status" AS ENUM('pending', 'translating', 'generating_audio', 'ready', 'error');--> statement-breakpoint
CREATE TABLE "affiliate_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price" numeric(10, 2),
	"affiliateUrl" text NOT NULL,
	"imageUrl" text,
	"category" varchar(64) DEFAULT 'gear' NOT NULL,
	"brand" varchar(128),
	"badge" varchar(64),
	"commission" varchar(32),
	"published" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"videoUrl" text,
	"thumbnailUrl" text,
	"category" varchar(64) DEFAULT 'motivation' NOT NULL,
	"duration" varchar(32),
	"badge" varchar(64),
	"published" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"excerpt" text,
	"content" text NOT NULL,
	"imageUrl" text,
	"category" varchar(64) DEFAULT 'mindset' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "digital_product_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"language" varchar(8) NOT NULL,
	"languageName" varchar(64) NOT NULL,
	"status" "translation_status" DEFAULT 'pending' NOT NULL,
	"translatedText" text,
	"pdfUrl" text,
	"audioUrl" text,
	"audioDuration" varchar(32),
	"errorMessage" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"category" varchar(64) DEFAULT 'guide' NOT NULL,
	"productType" "product_type" DEFAULT 'pdf' NOT NULL,
	"imageUrl" text,
	"fileKey" text,
	"fileUrl" text,
	"fileName" varchar(255),
	"audioUrl" text,
	"duration" varchar(32),
	"badge" varchar(64),
	"published" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"productId" integer NOT NULL,
	"email" varchar(320) NOT NULL,
	"stripePaymentIntentId" varchar(128),
	"downloadToken" varchar(128) NOT NULL,
	"downloadedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "digital_purchases_downloadToken_unique" UNIQUE("downloadToken")
);
--> statement-breakpoint
CREATE TABLE "membership_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"interval" interval_type DEFAULT 'monthly' NOT NULL,
	"features" json DEFAULT '[]'::json NOT NULL,
	"badge" varchar(64),
	"stripePriceId" varchar(128),
	"published" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"compareAtPrice" numeric(10, 2),
	"category" varchar(64) DEFAULT 'apparel' NOT NULL,
	"sizes" json DEFAULT '["S","M","L","XL","XXL"]'::json NOT NULL,
	"imageUrl" text,
	"badge" varchar(64),
	"inStock" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"shopifyVariantId" varchar(128),
	"shopifyProductId" varchar(128),
	"printifyProductId" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(128) NOT NULL,
	"value" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
