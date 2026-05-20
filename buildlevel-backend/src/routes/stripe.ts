import { Router, Request, Response } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { digitalProducts, digitalPurchases } from "../db/schema.js";

const router = Router();

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2025-01-27.acacia" as any,
  });
}

// ─── Physical product checkout ────────────────────────────────────────────────
router.post("/checkout", async (req: Request, res: Response) => {
  try {
    const stripe = getStripe();
    const { items, currency = "usd", customerEmail } = req.body;
    const origin = req.headers.origin || process.env.FRONTEND_URL || "http://localhost:5173";

    const lineItems = items.map((item: any) => ({
      price_data: {
        currency,
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round(item.priceUSD * 100),
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: "payment",
      customer_email: customerEmail || undefined,
      allow_promotion_codes: true,
      shipping_address_collection: {
        allowed_countries: ["US", "GB", "CA", "AU", "DE", "FR", "JP", "NG", "ZA", "AE"],
      },
      success_url: `${origin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop`,
    });

    res.json({ url: session.url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Digital product checkout ─────────────────────────────────────────────────
router.post("/digital-checkout", async (req: Request, res: Response) => {
  try {
    const stripe = getStripe();
    const { productId, customerEmail } = req.body;
    const origin = req.headers.origin || process.env.FRONTEND_URL || "http://localhost:5173";

    const db = await getDb();
    const [product] = await db.select().from(digitalProducts).where(eq(digitalProducts.id, productId)).limit(1);
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: product.name },
          unit_amount: Math.round(parseFloat(product.price) * 100),
        },
        quantity: 1,
      }],
      mode: "payment",
      customer_email: customerEmail || undefined,
      metadata: { productId: String(productId), type: "digital" },
      success_url: `${origin}/digital?purchased=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/digital`,
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
