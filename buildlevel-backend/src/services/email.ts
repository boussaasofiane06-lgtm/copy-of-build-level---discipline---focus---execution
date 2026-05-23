import nodemailer from "nodemailer";

const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || "info@buildlevel.com";

export function isEmailConfigured() {
  return !!(process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASS);
}

function getTransporter() {
  if (!isEmailConfigured()) {
    throw new Error("Zoho SMTP is not configured");
  }

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
  const from = process.env.ZOHO_SMTP_FROM || BUSINESS_EMAIL;

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
  const from = process.env.ZOHO_SMTP_FROM || BUSINESS_EMAIL;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

export { BUSINESS_EMAIL };
