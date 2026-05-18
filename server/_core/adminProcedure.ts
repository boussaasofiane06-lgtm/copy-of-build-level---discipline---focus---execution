import { TRPCError } from "@trpc/server";
import { ADMIN_COOKIE, verifyAdminPassword, verifyAdminToken } from "./adminAuth";
import { publicProcedure } from "./trpc";

function parseCookieHeader(header: string | undefined): Map<string, string> {
  if (!header) return new Map();
  const map = new Map<string, string>();
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) map.set(k.trim(), decodeURIComponent(v.join("=")));
  }
  return map;
}

export const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const req = ctx.req;
  const cookies = parseCookieHeader(req?.headers?.cookie);
  const cookieToken = cookies.get(ADMIN_COOKIE);
  if (cookieToken && await verifyAdminToken(cookieToken)) {
    return next({ ctx });
  }

  const authHeader = req?.headers?.authorization;
  if (authHeader?.startsWith("Bearer ") && await verifyAdminToken(authHeader.substring(7))) {
    return next({ ctx });
  }

  const headerToken = req?.headers?.["x-admin-token"];
  if (typeof headerToken === "string" && verifyAdminPassword(headerToken, process.env.ADMIN_PASSWORD_HASH || "")) {
    return next({ ctx });
  }

  throw new TRPCError({ code: "UNAUTHORIZED", message: "Admin access required" });
});
