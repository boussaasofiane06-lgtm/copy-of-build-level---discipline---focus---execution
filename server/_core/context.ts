import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ADMIN_COOKIE, ADMIN_OPEN_ID, verifyAdminToken } from "./adminAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function parseCookies(header: string | undefined): Map<string, string> {
  if (!header) return new Map();
  const map = new Map<string, string>();
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) map.set(k.trim(), decodeURIComponent(v.join("=")));
  }
  return map;
}

// Synthetic admin user — used when the custom password cookie is valid
const ADMIN_USER: User = {
  id: 0,
  openId: ADMIN_OPEN_ID,
  name: "Admin",
  email: null,
  loginMethod: "password",
  role: "admin",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // 1. Try custom admin password cookie first
  const cookies = parseCookies(opts.req.headers.cookie);
  const adminToken = cookies.get(ADMIN_COOKIE);
  if (adminToken && await verifyAdminToken(adminToken)) {
    return { req: opts.req, res: opts.res, user: ADMIN_USER };
  }

  // 2. Fall back to Manus OAuth session
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
