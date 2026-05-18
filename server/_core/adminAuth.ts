/**
 * Custom password-based admin authentication.
 * Completely independent of Manus OAuth.
 * The admin password hash is stored as an env var (ADMIN_PASSWORD_HASH).
 * Format: salt:hash (both hex-encoded, scrypt-derived)
 */

import crypto from "crypto";
import path from "path";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import multer from "multer";
import { ENV } from "./env";

// Multer: store file in memory for S3 upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const ADMIN_COOKIE = "bl_admin_session";
const ADMIN_OPEN_ID = "__buildlevel_admin__";
const ONE_YEAR_S = 365 * 24 * 60 * 60;

// ─── Password verification ────────────────────────────────────────────────────

export function verifyAdminPassword(input: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const keyLength = hash.length / 2;
    if (!Number.isInteger(keyLength) || keyLength <= 0) return false;
    const derived = crypto.scryptSync(input, salt, keyLength).toString("hex");
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

export async function verifyAdminRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ") && await verifyAdminToken(authHeader.substring(7))) {
    return true;
  }

  const headerToken = req.headers["x-admin-token"];
  if (typeof headerToken === "string" && verifyAdminPassword(headerToken, process.env.ADMIN_PASSWORD_HASH || "")) {
    return true;
  }

  const cookies = parseCookies(req.headers.cookie);
  return verifyAdminToken(cookies.get(ADMIN_COOKIE));
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

    if (!password || !verifyAdminPassword(password, storedHash)) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    const token = await signAdminToken();
    res.cookie(ADMIN_COOKIE, token, getAdminCookieOptions(req));
    // Also return token in body so cross-origin frontends can use Authorization header
    res.json({ success: true, token });
  });

  // POST /api/admin/logout — clear admin cookie
  app.post("/api/admin/logout", (req: Request, res: Response) => {
    res.clearCookie(ADMIN_COOKIE, { ...getAdminCookieOptions(req), maxAge: -1 });
    res.json({ success: true });
  });

  // GET /api/admin/me — check if admin cookie is valid
  app.get("/api/admin/me", async (req: Request, res: Response) => {
    const valid = await verifyAdminRequest(req);
    res.json({ admin: valid, isAdmin: valid });
  });

  // POST /api/admin/upload-image — upload product image to S3 storage
  // Auth: x-admin-token header OR admin session cookie
  app.post("/api/admin/upload-image", upload.single("image"), async (req: Request, res: Response) => {
    try {
      if (!(await verifyAdminRequest(req))) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ error: "No image file provided" });
        return;
      }

      // Convert to base64 data URL — no external storage needed
      const base64 = file.buffer.toString("base64");
      const dataUrl = `data:${file.mimetype};base64,${base64}`;

      res.json({ url: dataUrl });
    } catch (err: any) {
      console.error("[upload-image] Error:", err);
      res.status(500).json({ error: err?.message || "Upload failed" });
    }
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
