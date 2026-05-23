import { Router, Request, Response } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { digitalProducts, digitalPurchases } from "../db/schema.js";

const router = Router();

function getStripeSecretKey() {
  const raw = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!raw) throw new Error("STRIPE_SECRET_KEY is not configured");

  const embeddedKey = raw.match(/sk_(?:test|live)_[A-Za-z0-9]{20,}/)?.[0];
  const key = embeddedKey || raw;

  if (!/^sk_(test|live)_[A-Za-z0-9]{20,}$/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY must be the raw Stripe secret key starting with sk_test_ or sk_live_");
  }

  return key;
}

function getStripe() {
  return new Stripe(getStripeSecretKey(), {
    apiVersion: "2025-01-27.acacia" as any,
  });
}

type CheckoutLineItem = {
  name: string;
  unitAmount: number;
  quantity: number;
  image?: string;
};

async function createCheckoutSessionDirect({
  lineItems,
  successUrl,
  cancelUrl,
  customerEmail,
  metadata,
  shippingCountries,
}: {
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
  shippingCountries?: string[];
}) {
  const secretKey = getStripeSecretKey();

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", successUrl);
  body.set("cancel_url", cancelUrl);
  body.set("allow_promotion_codes", "true");
  if (customerEmail) body.set("customer_email", customerEmail);

  lineItems.forEach((item, index) => {
    body.set(`line_items[${index}][price_data][currency]`, "usd");
    body.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    if (item.image) body.set(`line_items[${index}][price_data][product_data][images][0]`, item.image);
    body.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmount));
    body.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  shippingCountries?.forEach((country, index) => {
    body.set(`shipping_address_collection[allowed_countries][${index}]`, country);
  });

  for (const [key, value] of Object.entries(metadata || {})) {
    body.set(`metadata[${key}]`, value);
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json() as { url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) {
    throw new Error(data.error?.message || `Stripe checkout failed with ${response.status}`);
  }

  return data;
}

// ─── Physical product checkout ────────────────────────────────────────────────
router.post("/checkout", async (req: Request, res: Response) => {
  try {
    const { items, currency = "usd", customerEmail } = req.body;
    const origin = req.headers.origin || process.env.FRONTEND_URL || "http://localhost:5173";

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Checkout requires at least one item" });
      return;
    }

    const session = await createCheckoutSessionDirect({
      lineItems: items.map((item: any) => ({
        name: item.name,
        image: item.image,
        unitAmount: Math.round(Number(item.priceUSD) * 100),
        quantity: Number(item.quantity || 1),
      })),
      customerEmail,
      shippingCountries: ["US", "GB", "CA", "AU", "DE", "FR", "JP", "NG", "ZA", "AE"],
      successUrl: `${origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/shop`,
    });

    res.json({ url: session.url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Digital product checkout ─────────────────────────────────────────────────
router.post("/digital-checkout", async (req: Request, res: Response) => {
  try {
    const { productId, customerEmail } = req.body;
    const origin = req.headers.origin || process.env.FRONTEND_URL || "http://localhost:5173";

    const db = await getDb();
    const [product] = await db.select().from(digitalProducts).where(eq(digitalProducts.id, productId)).limit(1);
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const session = await createCheckoutSessionDirect({
      lineItems: [{
        name: product.name,
        unitAmount: Math.round(parseFloat(product.price) * 100),
        quantity: 1,
      }],
      customerEmail,
      metadata: { productId: String(productId), type: "digital" },
      successUrl: `${origin}/digital?purchased=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/digital`,
    });

    res.json({ url: session.url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Stripe webhook ───────────────────────────────────────────────────────────
router.post("/webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (e: any) {
    res.status(400).json({ error: `Webhook error: ${e.message}` });
    return;
  }

  // Handle test events
  if (event.id.startsWith("evt_test_")) {
    res.json({ verified: true });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.type === "digital") {
      try {
        const db = await getDb();
        const token = crypto.randomBytes(32).toString("hex");
        await db.insert(digitalPurchases).values({
          productId: parseInt(session.metadata.productId),
          email: session.customer_email || "",
          stripePaymentIntentId: session.payment_intent as string,
          downloadToken: token,
          createdAt: new Date(),
        });
      } catch (e) {
        console.error("[Webhook] Failed to record digital purchase:", e);
      }
    }
  }

  res.json({ received: true });
});

export default router;
