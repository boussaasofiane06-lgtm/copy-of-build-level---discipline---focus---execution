import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { scryptSync, timingSafeEqual } from "crypto";

const ADMIN_COOKIE = "bl_admin_token";
const JWT_SECRET = () => process.env.JWT_SECRET || "fallback-dev-secret-change-in-prod";

export function verifyAdminPassword(password: string): boolean {
  const stored = process.env.ADMIN_PASSWORD_HASH;
  if (!stored) return false;
  const colonIdx = stored.indexOf(":");
  if (colonIdx === -1) return false;
  const salt = stored.substring(0, colonIdx);
  const storedHash = stored.substring(colonIdx + 1);
  const keyLen = storedHash.length / 2;
  try {
    const derived = scryptSync(password, salt, keyLen);
    const derivedHex = derived.toString("hex");
    return timingSafeEqual(Buffer.from(derivedHex), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

export function signAdminToken(): string {
  return jwt.sign({ admin: true }, JWT_SECRET(), { expiresIn: "7d" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Accept token from cookie OR Authorization header (for cross-origin frontends)
  let token = req.cookies?.[ADMIN_COOKIE];
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    jwt.verify(token, JWT_SECRET());
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export { ADMIN_COOKIE };
