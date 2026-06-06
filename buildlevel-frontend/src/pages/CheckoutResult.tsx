import { Link, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useCart } from "../context/CartContext";
import SubscribeForm from "../components/SubscribeForm";

function ActionButtons() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
      <Link to="/" className="btn btn-primary">Return Home</Link>
      <Link to="/shop" className="btn btn-outline">Continue Shopping</Link>
      <Link to="/contact" className="btn btn-outline">Contact Support</Link>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text3)", fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
      <strong style={{ color: "var(--text)", textAlign: "right" }}>{value}</strong>
    </div>
  );
}

export function CheckoutSuccess() {
  const [params] = useSearchParams();
  const hasSession = Boolean(params.get("session_id"));
  const cart = useCart();

  useEffect(() => {
    const sessionId = params.get("session_id") || "";
    cart.markConverted(sessionId).finally(() => cart.clearCart("apparel"));
  }, []);

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "64px 0 38px" }}>
        <div className="container">
          <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>
            Payment Successful
          </p>
          <h1 style={{ marginBottom: 10 }}>Thank You For Your Order</h1>
          <p style={{ color: "var(--text2)", maxWidth: 660, lineHeight: 1.7 }}>
            Your Build Level order was received successfully. We are preparing the next step and will send updates to the email used at checkout.
          </p>
        </div>
      </div>

      <div className="container section-sm" style={{ maxWidth: 860 }}>
        <div className="card" style={{ padding: 30, marginBottom: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, alignItems: "start" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--red)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800 }}>
              OK
            </div>
            <div>
              <h2 style={{ fontSize: "1.35rem", marginBottom: 10 }}>Order Received</h2>
              <p style={{ color: "var(--text2)", lineHeight: 1.75, marginBottom: 6 }}>
                Your payment was successful and your order is now in our system.
              </p>
              <p style={{ color: "var(--text2)", lineHeight: 1.75 }}>
                Your order was received successfully. Fulfillment is currently being reviewed.
              </p>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 30, marginBottom: 22 }}>
          <h3 style={{ fontSize: "1rem", marginBottom: 16 }}>Order Status</h3>
          <StatusRow label="Payment" value="Successful" />
          <StatusRow label="Order" value="Received" />
          <StatusRow label="Fulfillment" value="Being reviewed" />
          <StatusRow label="Updates" value="Sent by email" />
          {!hasSession && (
            <p style={{ color: "var(--text3)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 16 }}>
              If you reached this page after checkout and need help, contact support with the email used for payment.
            </p>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
          <div className="card" style={{ padding: 24 }}>
            <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Apparel Orders</p>
            <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>
              Your order was received successfully. Fulfillment is currently being reviewed.
            </p>
          </div>
          <div className="card" style={{ padding: 24 }}>
            <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>Digital Products</p>
            <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>
              Your digital product will be available by download link or email.
            </p>
          </div>
        </div>

        <ActionButtons />
        <div style={{ marginTop: 34 }}>
          <SubscribeForm source="checkout_success" />
        </div>
      </div>
    </div>
  );
}

export function CheckoutCancel() {
  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "64px 0 38px" }}>
        <div className="container">
          <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>
            Checkout Cancelled
          </p>
          <h1 style={{ marginBottom: 10 }}>No Payment Was Completed</h1>
          <p style={{ color: "var(--text2)", maxWidth: 660, lineHeight: 1.7 }}>
            Your checkout session was closed before payment was completed. You can return to the store when you are ready.
          </p>
        </div>
      </div>

      <div className="container section-sm" style={{ maxWidth: 760 }}>
        <div className="card" style={{ padding: 30 }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: 10 }}>Ready when you are.</h2>
          <p style={{ color: "var(--text2)", lineHeight: 1.75 }}>
            Your card was not charged. If checkout closed unexpectedly or you need help finishing your order, contact support.
          </p>
          <ActionButtons />
        </div>
      </div>
    </div>
  );
}
