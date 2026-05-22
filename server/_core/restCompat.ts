import type { Express, Request, Response, NextFunction } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { siteSettings } from "../../drizzle/schema";
import { verifyAdminToken } from "./adminAuth";

const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "x", "pinterest"] as const;
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || "info@thebuildlevel.com";

function parseCookies(header?: string) {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) map.set(key, decodeURIComponent(rest.join("=")));
  }
  return map;
}

async function requireAdminRest(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const headerToken = req.headers["x-admin-token"] as string | undefined;
  const cookieToken = parseCookies(req.headers.cookie).get("bl_admin_session");

  if (await verifyAdminToken(bearer || headerToken || cookieToken)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}

async function getSettingsMap(keys?: string[]) {
  const db = await getDb();
  const rows = await db.select().from(siteSettings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (!keys || keys.includes(row.key)) map[row.key] = row.value ?? "";
  }
  return map;
}

async function saveSetting(key: string, value: string) {
  const db = await getDb();
  const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(siteSettings).set({ value, updatedAt: new Date() }).where(eq(siteSettings.key, key));
  } else {
    await db.insert(siteSettings).values({ key, value, updatedAt: new Date() });
  }
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function socialEnvStatus(platform: string) {
  const upper = platform === "x" ? "X" : platform.toUpperCase();
  return {
    clientIdConfigured: !!process.env[`${upper}_CLIENT_ID`],
    clientSecretConfigured: !!process.env[`${upper}_CLIENT_SECRET`],
    accessTokenConfigured: !!process.env[`${upper}_ACCESS_TOKEN`],
  };
}

function isEmailConfigured() {
  return !!(process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS);
}

function getTransporter() {
  if (!isEmailConfigured()) throw new Error("Zoho SMTP is not configured");
  return nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || "smtp.zoho.com",
    port: Number(process.env.ZOHO_SMTP_PORT || 465),
    secure: String(process.env.ZOHO_SMTP_SECURE || "true") === "true",
    auth: {
      user: process.env.ZOHO_SMTP_USER,
      pass: process.env.ZOHO_SMTP_PASS,
    },
  });
}

export function registerRestCompatRoutes(app: Express) {
  app.get("/api/social-links", async (_req, res) => {
    try {
      const settings = await getSettingsMap();
      const links = SOCIAL_PLATFORMS
        .map((platform) => ({
          platform,
          handle: settings[`social_${platform}_handle`] || "",
          url: settings[`social_${platform}_url`] || "",
          enabled: settings[`social_${platform}_enabled`] === "true",
        }))
        .filter((link) => link.enabled && link.url && isValidHttpUrl(link.url));
      res.json({ email: BUSINESS_EMAIL, links });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tidio/config", async (_req, res) => {
    try {
      const settings = await getSettingsMap();
      const publicKey = settings.tidio_public_key || process.env.TIDIO_PUBLIC_KEY || "";
      res.json({
        enabled: settings.tidio_enabled === "true" && !!publicKey,
        publicKey,
        chatControls: settings.tidio_chat_controls || "manual",
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/contact", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(120),
        email: z.string().email().max(320),
        message: z.string().min(5).max(5000),
      });
      const data = schema.parse(req.body);
      const transporter = getTransporter();
      const from = process.env.ZOHO_SMTP_FROM || BUSINESS_EMAIL;
      await transporter.sendMail({
        from,
        to: BUSINESS_EMAIL,
        replyTo: data.email,
        subject: `Build Level contact: ${data.name}`,
        text: `Name: ${data.name}\nEmail: ${data.email}\n\n${data.message}`,
      });
      await transporter.sendMail({
        from,
        to: data.email,
        subject: "We received your Build Level message",
        text: `Thanks ${data.name},\n\nWe received your message and will reply from ${BUSINESS_EMAIL} soon.\n\nBUILD LEVEL`,
      }).catch(() => undefined);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ success: false, error: isEmailConfigured() ? e.message : "Email delivery is not configured" });
    }
  });

  app.get("/api/admin/integrations/social/settings", requireAdminRest, async (_req, res) => {
    try {
      const settings = await getSettingsMap();
      res.json({
        schedulerEnabled: settings.social_scheduler_enabled === "true",
        campaignName: settings.social_campaign_name || "",
        socialSharingEnabled: settings.social_sharing_enabled === "true",
        platforms: SOCIAL_PLATFORMS.map((platform) => ({
          platform,
          enabled: settings[`social_${platform}_enabled`] === "true",
          handle: settings[`social_${platform}_handle`] || "",
          url: settings[`social_${platform}_url`] || "",
          analyticsEnabled: settings[`social_${platform}_analytics_enabled`] === "true",
          oauth: socialEnvStatus(platform),
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/integrations/social/settings", requireAdminRest, async (req, res) => {
    try {
      const schema = z.object({
        schedulerEnabled: z.boolean().default(false),
        campaignName: z.string().optional().default(""),
        socialSharingEnabled: z.boolean().default(false),
        platforms: z.array(z.object({
          platform: z.enum(SOCIAL_PLATFORMS),
          enabled: z.boolean().default(false),
          handle: z.string().optional().default(""),
          url: z.string().optional().default(""),
          analyticsEnabled: z.boolean().default(false),
        })).default([]),
      });
      const data = schema.parse(req.body);
      await saveSetting("social_scheduler_enabled", String(data.schedulerEnabled));
      await saveSetting("social_campaign_name", data.campaignName);
      await saveSetting("social_sharing_enabled", String(data.socialSharingEnabled));
      for (const platform of data.platforms) {
        if (platform.url && !isValidHttpUrl(platform.url)) {
          res.status(400).json({ error: `Invalid URL for ${platform.platform}` });
          return;
        }
        await saveSetting(`social_${platform.platform}_enabled`, String(platform.enabled));
        await saveSetting(`social_${platform.platform}_handle`, platform.handle);
        await saveSetting(`social_${platform.platform}_url`, platform.url);
        await saveSetting(`social_${platform.platform}_analytics_enabled`, String(platform.analyticsEnabled));
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
}
