/* ==========================================================================
   BUILD LEVEL — Admin Router
   Protected procedures for product management and site settings
   Only accessible to users with role = 'admin'
   ========================================================================== */

import { TRPCError } from "@trpc/server";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { products, siteSettings } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";

// Admin-only middleware
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// Zod schemas
const productInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  price: z.number().positive(),
  compareAtPrice: z.number().positive().optional(),
  category: z.string().default("apparel"),
  sizes: z.array(z.string()).default(["S", "M", "L", "XL", "XXL"]),
  imageUrl: z.string().optional(),
  badge: z.string().optional(),
  inStock: z.boolean().default(true),
  featured: z.boolean().default(false),
  sortOrder: z.number().default(0),
  shopifyVariantId: z.string().optional(),
  shopifyProductId: z.string().optional(),
  printifyProductId: z.string().optional(),
});

export const adminRouter = router({
  // ─── Products ────────────────────────────────────────────────────────────

  /** List all products (admin view — includes out-of-stock) */
  listProducts: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    return db.select().from(products).orderBy(asc(products.sortOrder), asc(products.createdAt));
  }),

  /** Create a new product */
  createProduct: adminProcedure.input(productInput).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const result = await db.insert(products).values({
      name: input.name,
      description: input.description ?? null,
      price: String(input.price),
      compareAtPrice: input.compareAtPrice ? String(input.compareAtPrice) : null,
      category: input.category,
      sizes: input.sizes,
      imageUrl: input.imageUrl ?? null,
      badge: input.badge ?? null,
      inStock: input.inStock,
      featured: input.featured,
      sortOrder: input.sortOrder,
      shopifyVariantId: input.shopifyVariantId ?? null,
      shopifyProductId: input.shopifyProductId ?? null,
      printifyProductId: input.printifyProductId ?? null,
    }).returning({ id: products.id });
    return { id: result[0]?.id ?? 0, success: true };
  }),

  /** Update an existing product */
  updateProduct: adminProcedure
    .input(z.object({ id: z.number(), data: productInput.partial() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const updateData: Record<string, unknown> = {};
      if (input.data.name !== undefined) updateData.name = input.data.name;
      if (input.data.description !== undefined) updateData.description = input.data.description;
      if (input.data.price !== undefined) updateData.price = String(input.data.price);
      if (input.data.compareAtPrice !== undefined) updateData.compareAtPrice = input.data.compareAtPrice ? String(input.data.compareAtPrice) : null;
      if (input.data.category !== undefined) updateData.category = input.data.category;
      if (input.data.sizes !== undefined) updateData.sizes = input.data.sizes;
      if (input.data.imageUrl !== undefined) updateData.imageUrl = input.data.imageUrl;
      if (input.data.badge !== undefined) updateData.badge = input.data.badge;
      if (input.data.inStock !== undefined) updateData.inStock = input.data.inStock;
      if (input.data.featured !== undefined) updateData.featured = input.data.featured;
      if (input.data.sortOrder !== undefined) updateData.sortOrder = input.data.sortOrder;
      if (input.data.shopifyVariantId !== undefined) updateData.shopifyVariantId = input.data.shopifyVariantId;
      if (input.data.shopifyProductId !== undefined) updateData.shopifyProductId = input.data.shopifyProductId;
      if (input.data.printifyProductId !== undefined) updateData.printifyProductId = input.data.printifyProductId;
      await db.update(products).set(updateData).where(eq(products.id, input.id));
      return { success: true };
    }),

  /** Delete a product */
  deleteProduct: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(products).where(eq(products.id, input.id));
      return { success: true };
    }),

  /** Accept an external image URL for a product (no file upload needed) */
  uploadProductImage: adminProcedure
    .input(z.object({ imageUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      // Simply return the provided URL — admin pastes an external image URL
      return { url: input.imageUrl };
    }),

  // ─── Site Settings ────────────────────────────────────────────────────────

  /** Get all site settings as a key-value map */
  getSettings: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const rows = await db.select().from(siteSettings);
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value ?? "";
    }
    return map;
  }),

  /** Upsert a site setting */
  setSetting: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .insert(siteSettings)
        .values({ key: input.key, value: input.value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: input.value, updatedAt: new Date() } });
      return { success: true };
    }),

  /** Bulk upsert site settings */
  bulkSetSettings: adminProcedure
    .input(z.record(z.string(), z.string()))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      for (const [key, value] of Object.entries(input)) {
        await db
          .insert(siteSettings)
          .values({ key, value, updatedAt: new Date() })
          .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
      }
      return { success: true };
    }),
});
