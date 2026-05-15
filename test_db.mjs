import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq, desc } from 'drizzle-orm';

// Inline the schema definition to test
import { mysqlTable, int, varchar, text, boolean, timestamp, decimal, mysqlEnum } from 'drizzle-orm/mysql-core';

const digitalProducts = mysqlTable("digital_products", {
  id: int("id").autoincrement().primaryKey(),
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
  published: boolean("published").notNull().default(false),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

const dbUrl = process.env.DATABASE_URL;
console.log('Connecting...');

const db = drizzle(dbUrl);

try {
  const rows = await db
    .select()
    .from(digitalProducts)
    .where(eq(digitalProducts.published, true))
    .orderBy(desc(digitalProducts.sortOrder));
  console.log('SUCCESS! Rows:', rows.length);
  rows.forEach(r => console.log(' -', r.name, r.price));
} catch (e) {
  console.error('ERROR:', e.message);
  console.error('Full error:', e);
}

process.exit(0);
