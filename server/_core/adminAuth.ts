/**
 * Custom password-based admin authentication.
 * Completely independent of Manus OAuth.
 * The admin password hash is stored as an env var (ADMIN_PASSWORD_HASH).
 * Format: salt:hash (both hex-encoded, scrypt-derived)
 */

import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";

const ADMIN_COOKIE = "bl_admin_session";
const ADMIN_OPEN_ID = "__buildlevel_admin__";
const ONE_YEAR_S = 365 * 24 * 60 * 60;

// ─── Password verification ────────────────────────────────────────────────────

function verifyPassword(input: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = crypto.scryptSync(input, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret + "_admin");
}

async function signAdminToken(): Promise<string> {
  return new SignJWT({ role: "admin", openId: ADMIN_OPEN_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${ONE_YEAR_S}s`)
    .sign(getSecret());
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function isSecure(req: Request): boolean {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

function getAdminCookieOptions(req: Request) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none" as const,
    secure: isSecure(req),
    maxAge: ONE_YEAR_S * 1000,
  };
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerAdminAuthRoutes(app: Express) {
  // POST /api/admin/login — verify password, set admin cookie
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    const { password } = req.body as { password?: string };

    const storedHash = process.env.ADMIN_PASSWORD_HASH || "";
    if (!storedHash) {
      res.status(500).json({ error: "Admin auth not configured" });
      return;
    }

    if (!password || !verifyPassword(password, storedHash)) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    const token = await signAdminToken();
    res.cookie(ADMIN_COOKIE, token, getAdminCookieOptions(req));
    res.json({ success: true });
  });

  // POST /api/admin/logout — clear admin cookie
  app.post("/api/admin/logout", (req: Request, res: Response) => {
    res.clearCookie(ADMIN_COOKIE, { ...getAdminCookieOptions(req), maxAge: -1 });
    res.json({ success: true });
  });

  // GET /api/admin/me — check if admin cookie is valid
  app.get("/api/admin/me", async (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.get(ADMIN_COOKIE);
    const valid = await verifyAdminToken(token);
    res.json({ isAdmin: valid });
  });
}

function parseCookies(header: string | undefined): Map<string, string> {
  if (!header) return new Map();
  const map = new Map<string, string>();
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) map.set(k.trim(), decodeURIComponent(v.join("=")));
  }
  return map;
}

export { ADMIN_COOKIE, ADMIN_OPEN_ID };
