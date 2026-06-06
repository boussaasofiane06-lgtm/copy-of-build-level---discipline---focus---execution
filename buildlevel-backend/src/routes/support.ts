import { Router, Request } from "express";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { BUSINESS_EMAIL, isEmailConfigured, sendCustomerEmail } from "../services/email.js";

const router = Router();
let ensured = false;
const rateLimit = new Map<string, number[]>();
const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const orderCategories = new Set(["Order not received", "Order tracking", "Damaged apparel", "Wrong apparel item", "Wrong size or color received"]);

function clean(value: unknown, max = 5000) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function ip(req: Request) {
  return String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

function frontendOrigin(req: Request) {
  const origin = String(req.headers.origin || process.env.FRONTEND_URL || process.env.PUBLIC_FRONTEND_URL || "https://thebuildlevel.com");
  try { const url = new URL(origin); return `${url.protocol}//${url.host}`; } catch { return "https://thebuildlevel.com"; }
}

async function ensureSupportTables() {
  if (ensured) return;
  const db = await getDb();
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS support_tickets (id INT AUTO_INCREMENT PRIMARY KEY, ticketNumber VARCHAR(32) NOT NULL UNIQUE, accessTokenHash VARCHAR(128) NOT NULL, customerName VARCHAR(160) NOT NULL, customerEmail VARCHAR(320) NOT NULL, customerPhone VARCHAR(64) NULL, orderNumber VARCHAR(128) NULL, productName VARCHAR(255) NULL, category VARCHAR(128) NOT NULL, subject VARCHAR(255) NOT NULL, description TEXT NOT NULL, priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal', status ENUM('new','open','in_progress','waiting_customer','resolved','closed','reopened','spam','blocked') NOT NULL DEFAULT 'new', preferredReplyMethod VARCHAR(64) NULL, consentToContact BOOLEAN NOT NULL DEFAULT true, technicalInfo JSON NULL, assignedAdmin VARCHAR(160) NULL, relatedProductId INT NULL, relatedOrderId INT NULL, relatedStripePayment VARCHAR(128) NULL, relatedPrintifyOrder VARCHAR(128) NULL, relatedDigitalPurchaseId INT NULL, resolutionMessage TEXT NULL, ipAddress VARCHAR(128) NULL, lastCustomerResponseAt TIMESTAMP NULL, lastAdminResponseAt TIMESTAMP NULL, resolvedAt TIMESTAMP NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_support_status (status), INDEX idx_support_email (customerEmail), INDEX idx_support_category (category))`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS support_messages (id INT AUTO_INCREMENT PRIMARY KEY, ticketId INT NOT NULL, senderType ENUM('customer','admin','system') NOT NULL, senderName VARCHAR(160) NULL, message TEXT NOT NULL, public BOOLEAN NOT NULL DEFAULT true, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_support_messages_ticket (ticketId))`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS support_attachments (id INT AUTO_INCREMENT PRIMARY KEY, ticketId INT NOT NULL, messageId INT NULL, fileName VARCHAR(255) NOT NULL, mimeType VARCHAR(128) NOT NULL, sizeBytes INT NOT NULL, dataUrl MEDIUMTEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_support_attachments_ticket (ticketId))`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS support_internal_notes (id INT AUTO_INCREMENT PRIMARY KEY, ticketId INT NOT NULL, note TEXT NOT NULL, author VARCHAR(160) DEFAULT 'admin', createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_support_notes_ticket (ticketId))`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS support_status_history (id INT AUTO_INCREMENT PRIMARY KEY, ticketId INT NOT NULL, oldStatus VARCHAR(64) NULL, newStatus VARCHAR(64) NOT NULL, actor VARCHAR(160) DEFAULT 'system', createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_support_history_ticket (ticketId))`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS support_actions (id INT AUTO_INCREMENT PRIMARY KEY, ticketId INT NOT NULL, action VARCHAR(128) NOT NULL, details TEXT NULL, actor VARCHAR(160) DEFAULT 'admin', createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_support_actions_ticket (ticketId))`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS support_blocked_users (id INT AUTO_INCREMENT PRIMARY KEY, blockType ENUM('email','ip') NOT NULL, value VARCHAR(320) NOT NULL, reason TEXT NULL, active BOOLEAN NOT NULL DEFAULT true, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_support_block (blockType, value))`));
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS support_templates (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(160) NOT NULL, category VARCHAR(128) NULL, subject VARCHAR(255) NULL, body TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT true, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`));
  const templates = [
    ["Request received", "Thanks for contacting Build Level. We received your request and will review it."],
    ["Need order number", "Please send your order number so we can investigate this request."],
    ["Need screenshot", "Please attach a screenshot so we can better understand what happened."],
    ["Issue resolved", "We have resolved this issue. Reply if you need anything else."],
    ["Ticket closed", "This support ticket is now closed. You can reopen it from your ticket page if needed."],
  ];
  for (const [name, body] of templates) await db.execute(sql`INSERT INTO support_templates (name, body, enabled) SELECT ${name}, ${body}, true WHERE NOT EXISTS (SELECT 1 FROM support_templates WHERE name = ${name})`);
  ensured = true;
}

function priorityFor(category: string, description: string) {
  const text = `${category} ${description}`.toLowerCase();
  if (/charged but no order|duplicate charge|security|account access|checkout failure/.test(text)) return "urgent";
  if (/download missing|damaged|wrong|delivered|not received/.test(text)) return "high";
  if (/product question|return|tracking/.test(text)) return "normal";
  return "normal";
}

function publicStatus(status: string) {
  if (status === "in_progress" || status === "open" || status === "reopened") return "In Progress";
  if (status === "waiting_customer") return "Waiting for Customer";
  if (status === "resolved") return "Resolved";
  if (status === "closed") return "Closed";
  return "Received";
}

async function getTicketByToken(ticketNumber: string, token: string) {
  const db = await getDb();
  const [rows] = await db.execute(sql`SELECT * FROM support_tickets WHERE ticketNumber = ${ticketNumber} AND accessTokenHash = ${hashToken(token)} LIMIT 1`) as any;
  return rows?.[0] || null;
}

async function getTicketPayload(ticket: any, customerSafe = false) {
  const db = await getDb();
  const [messages] = await db.execute(sql`SELECT * FROM support_messages WHERE ticketId = ${ticket.id} ${customerSafe ? sql`AND public = true` : sql``} ORDER BY createdAt ASC`) as any;
  const [attachments] = await db.execute(sql`SELECT id, ticketId, messageId, fileName, mimeType, sizeBytes, createdAt ${customerSafe ? sql.raw("") : sql.raw(", dataUrl")} FROM support_attachments WHERE ticketId = ${ticket.id}`) as any;
  const [notes] = customerSafe ? [[]] : await db.execute(sql`SELECT * FROM support_internal_notes WHERE ticketId = ${ticket.id} ORDER BY createdAt DESC`) as any;
  return { ticket: { ...ticket, publicStatus: publicStatus(ticket.status), accessTokenHash: undefined, ipAddress: customerSafe ? undefined : ticket.ipAddress }, messages, attachments, notes };
}

const attachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().refine(value => allowedMimeTypes.includes(value), "Unsupported file type"),
  sizeBytes: z.number().max(5 * 1024 * 1024),
  dataUrl: z.string().max(7_000_000).optional().default(""),
});

router.post("/support/tickets", async (req: Request, res) => {
  try {
    await ensureSupportTables();
    const clientIp = ip(req);
    const now = Date.now();
    const recent = (rateLimit.get(clientIp) || []).filter(t => now - t < 60_000);
    if (recent.length >= 4) { res.status(429).json({ error: "Please wait before submitting another support request." }); return; }
    recent.push(now); rateLimit.set(clientIp, recent);
    const schema = z.object({
      customerName: z.string().min(1).max(160),
      customerEmail: z.string().email().max(320),
      customerPhone: z.string().max(64).optional().default(""),
      orderNumber: z.string().max(128).optional().default(""),
      productName: z.string().max(255).optional().default(""),
      category: z.string().min(1).max(128),
      subject: z.string().min(3).max(255),
      description: z.string().min(10).max(8000),
      preferredReplyMethod: z.string().max(64).optional().default("email"),
      consentToContact: z.boolean().refine(Boolean, "Consent to contact is required"),
      technicalInfo: z.record(z.string(), z.unknown()).optional().default({}),
      attachments: z.array(attachmentSchema).max(3).optional().default([]),
    });
    const data = schema.parse(req.body);
    if (orderCategories.has(data.category) && !data.orderNumber) { res.status(400).json({ error: "Please include your order number for this issue." }); return; }
    const db = await getDb();
    const [blocked] = await db.execute(sql`SELECT id FROM support_blocked_users WHERE active = true AND ((blockType = 'email' AND value = ${data.customerEmail.toLowerCase()}) OR (blockType = 'ip' AND value = ${clientIp})) LIMIT 1`) as any;
    if (blocked?.[0]) { res.status(403).json({ error: "Support access is unavailable. Contact support by email." }); return; }
    const token = randomToken();
    const year = new Date().getFullYear();
    const ticketNumber = `BL-${year}-${String(Math.floor(Math.random() * 900000) + 100000)}`;
    const priority = priorityFor(data.category, data.description);
    await db.execute(sql`INSERT INTO support_tickets (ticketNumber, accessTokenHash, customerName, customerEmail, customerPhone, orderNumber, productName, category, subject, description, priority, status, preferredReplyMethod, consentToContact, technicalInfo, ipAddress, lastCustomerResponseAt) VALUES (${ticketNumber}, ${hashToken(token)}, ${clean(data.customerName, 160)}, ${data.customerEmail.toLowerCase()}, ${clean(data.customerPhone, 64)}, ${clean(data.orderNumber, 128)}, ${clean(data.productName, 255)}, ${clean(data.category, 128)}, ${clean(data.subject, 255)}, ${clean(data.description)}, ${priority}, 'new', ${clean(data.preferredReplyMethod, 64)}, true, ${JSON.stringify(data.technicalInfo)}, ${clientIp}, NOW())`);
    const [ticketRows] = await db.execute(sql`SELECT * FROM support_tickets WHERE ticketNumber = ${ticketNumber} LIMIT 1`) as any;
    const ticket = ticketRows[0];
    await db.execute(sql`INSERT INTO support_messages (ticketId, senderType, senderName, message, public) VALUES (${ticket.id}, 'customer', ${clean(data.customerName, 160)}, ${clean(data.description)}, true)`);
    for (const file of data.attachments) await db.execute(sql`INSERT INTO support_attachments (ticketId, fileName, mimeType, sizeBytes, dataUrl) VALUES (${ticket.id}, ${clean(file.fileName, 255)}, ${file.mimeType}, ${file.sizeBytes}, ${file.dataUrl})`);
    const ticketUrl = `${frontendOrigin(req)}/support/ticket/${ticketNumber}?token=${token}`;
    if (isEmailConfigured()) await sendCustomerEmail({ to: data.customerEmail, subject: `Build Level support ticket ${ticketNumber}`, text: `Your request has been received.\n\nSupport ticket: ${ticketNumber}\nSubject: ${data.subject}\nCategory: ${data.category}\n\nView ticket: ${ticketUrl}\n\nSupport: ${BUSINESS_EMAIL}` }).catch(() => undefined);
    res.json({ success: true, ticketNumber, ticketUrl, message: "Your request has been received." });
  } catch (e: any) {
    const message = e instanceof z.ZodError ? (e as any).issues?.[0]?.message || "Check the support form and try again." : "We could not create your support request right now. Please try again.";
    res.status(400).json({ error: message });
  }
});

router.get("/support/tickets/:ticketNumber", async (req, res) => {
  try {
    await ensureSupportTables();
    const token = String(req.query.token || "");
    const ticket = await getTicketByToken(req.params.ticketNumber, token);
    if (!ticket) { res.status(404).json({ error: "Ticket not found or access link expired." }); return; }
    res.json(await getTicketPayload(ticket, true));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/support/tickets/:ticketNumber/reply", async (req, res) => {
  try {
    await ensureSupportTables();
    const data = z.object({ token: z.string(), message: z.string().min(2).max(6000), attachments: z.array(attachmentSchema).max(3).optional().default([]) }).parse(req.body);
    const ticket = await getTicketByToken(req.params.ticketNumber, data.token);
    if (!ticket) { res.status(404).json({ error: "Ticket not found or access link expired." }); return; }
    const db = await getDb();
    await db.execute(sql`INSERT INTO support_messages (ticketId, senderType, senderName, message, public) VALUES (${ticket.id}, 'customer', ${ticket.customerName}, ${clean(data.message)}, true)`);
    await db.execute(sql`UPDATE support_tickets SET status = IF(status IN ('resolved','closed'), 'reopened', status), lastCustomerResponseAt = NOW(), updatedAt = NOW() WHERE id = ${ticket.id}`);
    for (const file of data.attachments) await db.execute(sql`INSERT INTO support_attachments (ticketId, fileName, mimeType, sizeBytes, dataUrl) VALUES (${ticket.id}, ${clean(file.fileName, 255)}, ${file.mimeType}, ${file.sizeBytes}, ${file.dataUrl})`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: "We could not add your reply. Please try again." }); }
});

router.get("/admin/support/tickets", requireAdmin, async (req, res) => {
  try {
    await ensureSupportTables();
    const db = await getDb();
    const status = clean(req.query.status, 64);
    const search = `%${clean(req.query.search, 160)}%`;
    const [rows] = await db.execute(sql`SELECT * FROM support_tickets WHERE (${status} = '' OR status = ${status}) AND (${search} = '%%' OR ticketNumber LIKE ${search} OR customerEmail LIKE ${search} OR orderNumber LIKE ${search} OR productName LIKE ${search}) ORDER BY updatedAt DESC LIMIT 300`) as any;
    res.json(rows || []);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/admin/support/tickets/:id", requireAdmin, async (req, res) => {
  try {
    await ensureSupportTables();
    const db = await getDb();
    const [rows] = await db.execute(sql`SELECT * FROM support_tickets WHERE id = ${Number(req.params.id)} LIMIT 1`) as any;
    if (!rows?.[0]) { res.status(404).json({ error: "Ticket not found" }); return; }
    res.json(await getTicketPayload(rows[0], false));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/admin/support/tickets/:id/reply", requireAdmin, async (req, res) => {
  try {
    await ensureSupportTables();
    const data = z.object({ message: z.string().min(2).max(6000), status: z.string().optional().default("waiting_customer"), public: z.boolean().optional().default(true) }).parse(req.body);
    const db = await getDb();
    const [rows] = await db.execute(sql`SELECT * FROM support_tickets WHERE id = ${Number(req.params.id)} LIMIT 1`) as any;
    const ticket = rows?.[0];
    if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
    await db.execute(sql`INSERT INTO support_messages (ticketId, senderType, senderName, message, public) VALUES (${ticket.id}, 'admin', 'Build Level Support', ${clean(data.message)}, ${data.public})`);
    await db.execute(sql`UPDATE support_tickets SET status = ${data.status}, lastAdminResponseAt = NOW(), updatedAt = NOW(), resolvedAt = IF(${data.status} = 'resolved', NOW(), resolvedAt) WHERE id = ${ticket.id}`);
    await db.execute(sql`INSERT INTO support_actions (ticketId, action, details, actor) VALUES (${ticket.id}, 'admin_reply', ${data.message.slice(0, 500)}, 'admin')`);
    if (data.public && isEmailConfigured()) await sendCustomerEmail({ to: ticket.customerEmail, subject: `Update on support ticket ${ticket.ticketNumber}`, text: `${data.message}\n\nView ticket: ${frontendOrigin(req)}/support/ticket/${ticket.ticketNumber}?token=use-your-original-secure-link` }).catch(() => undefined);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/admin/support/tickets/:id/note", requireAdmin, async (req, res) => {
  try {
    await ensureSupportTables();
    const note = clean(z.object({ note: z.string().min(2).max(6000) }).parse(req.body).note);
    const db = await getDb();
    await db.execute(sql`INSERT INTO support_internal_notes (ticketId, note, author) VALUES (${Number(req.params.id)}, ${note}, 'admin')`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/admin/support/tickets/:id", requireAdmin, async (req, res) => {
  try {
    await ensureSupportTables();
    const data = z.object({ status: z.string().optional(), priority: z.string().optional(), assignedAdmin: z.string().optional(), resolutionMessage: z.string().optional() }).parse(req.body);
    const db = await getDb();
    const [oldRows] = await db.execute(sql`SELECT status FROM support_tickets WHERE id = ${Number(req.params.id)} LIMIT 1`) as any;
    await db.execute(sql`UPDATE support_tickets SET status = COALESCE(${data.status ?? null}, status), priority = COALESCE(${data.priority ?? null}, priority), assignedAdmin = COALESCE(${data.assignedAdmin ?? null}, assignedAdmin), resolutionMessage = COALESCE(${data.resolutionMessage ?? null}, resolutionMessage), resolvedAt = IF(${data.status || ""} = 'resolved', NOW(), resolvedAt), updatedAt = NOW() WHERE id = ${Number(req.params.id)}`);
    if (data.status) await db.execute(sql`INSERT INTO support_status_history (ticketId, oldStatus, newStatus, actor) VALUES (${Number(req.params.id)}, ${oldRows?.[0]?.status || null}, ${data.status}, 'admin')`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/admin/support/block", requireAdmin, async (req, res) => {
  try {
    await ensureSupportTables();
    const data = z.object({ blockType: z.enum(["email", "ip"]), value: z.string().min(1).max(320), reason: z.string().optional().default("") }).parse(req.body);
    const db = await getDb();
    await db.execute(sql`INSERT INTO support_blocked_users (blockType, value, reason, active) VALUES (${data.blockType}, ${data.value.toLowerCase()}, ${data.reason}, true) ON DUPLICATE KEY UPDATE active = true, reason = VALUES(reason)`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/admin/support/templates", requireAdmin, async (_req, res) => {
  await ensureSupportTables();
  const db = await getDb();
  const [rows] = await db.execute(sql`SELECT * FROM support_templates ORDER BY name`) as any;
  res.json(rows || []);
});

router.post("/admin/support/templates", requireAdmin, async (req, res) => {
  try {
    await ensureSupportTables();
    const data = z.object({ name: z.string().min(1).max(160), category: z.string().optional().default(""), subject: z.string().optional().default(""), body: z.string().min(2).max(6000) }).parse(req.body);
    const db = await getDb();
    await db.execute(sql`INSERT INTO support_templates (name, category, subject, body, enabled) VALUES (${data.name}, ${data.category}, ${data.subject}, ${data.body}, true)`);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
