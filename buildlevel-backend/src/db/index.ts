import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle> | null = null;

function buildPoolConfig(rawUrl: string): mysql.PoolOptions {
  try {
    const parsed = new URL(rawUrl);
    const sslParam = parsed.searchParams.get("ssl");
    if (!sslParam) {
      return { uri: rawUrl };
    }
    parsed.searchParams.delete("ssl");
    const cleanUrl = parsed.toString();
    let sslConfig: mysql.SslOptions;
    if (sslParam === "require" || sslParam === "true") {
      sslConfig = { rejectUnauthorized: false };
    } else {
      try {
        sslConfig = JSON.parse(sslParam);
      } catch {
        sslConfig = { rejectUnauthorized: false };
      }
    }
    return { uri: cleanUrl, ssl: sslConfig };
  } catch {
    return { uri: rawUrl };
  }
}

export async function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const config = buildPoolConfig(url);
    const pool = mysql.createPool(config);
    await pool.query("SELECT 1"); // verify connection
    _db = drizzle(pool, { schema, mode: "default" }) as any;
    console.log("[DB] Connected to Railway MySQL");
  }
  return _db;
}
