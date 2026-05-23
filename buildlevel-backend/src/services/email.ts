import nodemailer from "nodemailer";

const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || "info@thebuildlevel.com";

function cleanEnv(value?: string) {
  return (value || "").trim();
}

function cleanSecret(value?: string) {
  return cleanEnv(value).replace(/\s+/g, "");
}

export function isEmailConfigured() {
  return !!(cleanEnv(process.env.ZOHO_SMTP_USER) && cleanSecret(process.env.ZOHO_SMTP_PASS));
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error("Zoho SMTP is not configured");
  }

  return nodemailer.createTransport({
    host: cleanEnv(process.env.ZOHO_SMTP_HOST) || "smtp.zoho.com",
    port: Number(cleanEnv(process.env.ZOHO_SMTP_PORT) || 465),
    secure: String(cleanEnv(process.env.ZOHO_SMTP_SECURE) || "true") === "true",
    auth: {
      user: cleanEnv(process.env.ZOHO_SMTP_USER),
      pass: cleanSecret(process.env.ZOHO_SMTP_PASS),
    },
  });
}

export async function sendBusinessEmail({
  subject,
  text,
  html,
  replyTo,
}: {
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}) {
  const transporter = getTransporter();
  const from = cleanEnv(process.env.ZOHO_SMTP_FROM) || BUSINESS_EMAIL;

  await transporter.sendMail({
    from,
    to: BUSINESS_EMAIL,
    subject,
    text,
    html,
    replyTo,
  });
}

export async function sendCustomerEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const transporter = getTransporter();
  const from = cleanEnv(process.env.ZOHO_SMTP_FROM) || BUSINESS_EMAIL;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

export { BUSINESS_EMAIL };
