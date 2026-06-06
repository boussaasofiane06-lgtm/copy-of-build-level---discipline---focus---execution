import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useCart, type CartItem } from "../context/CartContext";

const storageImageUrl = (value?: string | null) => {
  if (!value) return "";
  if (value.startsWith("storage:")) return `/api/digital/thumbnail/${encodeURIComponent(value.slice("storage:".length))}`;
  if (value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return storageImageUrl(parsed[0]);
    } catch {
      return "";
    }
  }
  return value;
};

function CartLine({ item }: { item: CartItem }) {
  const cart = useCart();
  const key = cart.getItemKey(item);
  return (
    <div className="cart-line">
      <div className="cart-line__image">
        {storageImageUrl(item.imageUrl) ? <img src={storageImageUrl(item.imageUrl)} alt={item.name} /> : <span>No Image</span>}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <span className="badge badge-dark">{item.productType === "apparel" ? "Apparel" : "Digital"}</span>
            <h4 style={{ fontSize: "0.92rem", marginTop: 7 }}>{item.name}</h4>
          </div>
          <button type="button" onClick={() => cart.removeItem(key)} aria-label={`Remove ${item.name}`} className="cart-remove-button">Remove</button>
        </div>
        <div style={{ color: "var(--text3)", fontSize: "0.78rem", lineHeight: 1.55, marginTop: 6 }}>
          {item.productType === "apparel" ? (
            <>
              {item.selectedSize && <div>Size / option: {item.selectedSize}</div>}
              {item.selectedColor && <div>Color: {item.selectedColor}</div>}
              {item.printifyVariantId && <div>Variant: {item.printifyVariantId}</div>}
              <div>Shipping calculated at checkout.</div>
            </>
          ) : (
            <div>Instant digital access. No shipping required.</div>
          )}
        </div>
        <div className="cart-line__footer">
          <div className="cart-quantity">
            <button type="button" onClick={() => cart.updateQuantity(key, item.quantity - 1)} aria-label={`Decrease ${item.name} quantity`}>-</button>
            <span>{item.quantity}</span>
            <button type="button" onClick={() => cart.updateQuantity(key, item.quantity + 1)} aria-label={`Increase ${item.name} quantity`}>+</button>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "var(--text3)", fontSize: "0.75rem" }}>${item.unitPrice.toFixed(2)} each</div>
            <strong>${(item.unitPrice * item.quantity).toFixed(2)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: CartItem[] }) {
  if (!items.length) return null;
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: "0.82rem", color: "var(--red)", marginBottom: 12 }}>{title}</h3>
      <div style={{ display: "grid", gap: 14 }}>
        {items.map(item => <CartLine key={`${item.productType}-${item.productId}-${item.selectedVariant || item.selectedSize || "default"}`} item={item} />)}
      </div>
    </section>
  );
}

export function CartDrawer() {
  const cart = useCart();
  const [checkingOut, setCheckingOut] = useState<"apparel" | "digital" | "">("");
  const [error, setError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const apparel = cart.items.filter(item => item.productType === "apparel");
  const digital = cart.items.filter(item => item.productType === "digital");

  useEffect(() => {
    if (!cart.isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cart.closeCart();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [cart.isOpen]);

  const runCheckout = async (type: "apparel" | "digital") => {
    setError("");
    setCheckingOut(type);
    try {
      if (type === "apparel") await cart.checkoutApparel();
      else await cart.checkoutDigital();
    } catch (checkoutError: any) {
      setError(checkoutError?.response?.data?.error || "Checkout failed. Please review your cart and try again.");
      setCheckingOut("");
    }
  };

  if (!cart.isOpen) return null;

  return createPortal(
    <div className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="global-cart-title">
      <div className="cart-drawer__backdrop" aria-hidden="true" onClick={cart.closeCart} />
      <aside className="cart-drawer__panel global-cart-panel">
        <div className="global-cart-header">
          <div>
            <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.7rem", letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Discipline • Focus • Execution
            </p>
            <h2 id="global-cart-title" style={{ fontSize: "1.15rem", marginTop: 4 }}>Your Cart</h2>
          </div>
          <button ref={closeRef} type="button" onClick={cart.closeCart} aria-label="Close cart" className="cart-close-button">×</button>
        </div>

        {cart.notice && (
          <div className="cart-added-notice">
            <strong>{cart.notice}</strong>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={cart.openCart} className="btn btn-primary btn-sm">View Cart</button>
              <button type="button" onClick={cart.closeCart} className="btn btn-outline btn-sm">Continue Shopping</button>
            </div>
          </div>
        )}

        <div className="global-cart-body">
          {cart.items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 12px" }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 10 }}>Your cart is empty.</h3>
              <p style={{ color: "var(--text2)", marginBottom: 20 }}>Build your next level with apparel and digital resources.</p>
              <Link to="/shop" onClick={cart.closeCart} className="btn btn-primary">Start Shopping</Link>
            </div>
          ) : (
            <>
              <Section title="Apparel" items={apparel} />
              <Section title="Digital Products" items={digital} />
            </>
          )}
        </div>

        {cart.items.length > 0 && (
          <div className="global-cart-footer">
            <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
              <input className="input" type="email" placeholder="Email for saved cart and checkout" value={cart.email} onChange={event => cart.setCustomer({ email: event.target.value })} />
              <input className="input" type="text" placeholder="First name (optional)" value={cart.firstName} onChange={event => cart.setCustomer({ firstName: event.target.value })} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ color: "var(--text2)" }}>Subtotal</span>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem" }}>${cart.subtotal.toFixed(2)}</strong>
            </div>
            {apparel.length > 0 && <button type="button" disabled={!!checkingOut} onClick={() => runCheckout("apparel")} className="btn btn-primary" style={{ width: "100%", marginBottom: 10 }}>{checkingOut === "apparel" ? "Redirecting..." : "Checkout Apparel with Stripe"}</button>}
            {digital.length > 0 && <button type="button" disabled={!!checkingOut} onClick={() => runCheckout("digital")} className="btn btn-outline" style={{ width: "100%", marginBottom: 10 }}>{checkingOut === "digital" ? "Redirecting..." : digital.length > 1 ? "Checkout First Digital Product" : "Checkout Digital Product"}</button>}
            {apparel.length > 0 && digital.length > 0 && <p style={{ color: "var(--text3)", fontSize: "0.75rem", lineHeight: 1.55, marginBottom: 10 }}>Apparel and digital products are kept separate for fulfillment safety. Digital items never go to Printify.</p>}
            {error && <p style={{ color: "var(--red)", fontSize: "0.82rem", marginBottom: 10 }}>{error}</p>}
            <button type="button" onClick={cart.closeCart} className="btn btn-ghost" style={{ width: "100%" }}>Continue Shopping</button>
          </div>
        )}
      </aside>
    </div>,
    document.body
  );
}

export function SavedCartReminder() {
  const cart = useCart();
  if (cart.itemCount === 0 || cart.hasDismissedReminder || cart.isOpen) return null;
  return (
    <div className="saved-cart-reminder" role="status">
      <div>
        <strong>You still have items in your cart.</strong>
        <p>Pick up where you left off when you’re ready.</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={cart.openCart} className="btn btn-primary btn-sm">View Cart</button>
        <Link to="/shop" className="btn btn-outline btn-sm">Continue Shopping</Link>
        <button type="button" onClick={cart.dismissReminder} className="btn btn-ghost btn-sm">Dismiss</button>
      </div>
    </div>
  );
}

export function CartAddNotice() {
  const cart = useCart();
  if (!cart.notice || cart.isOpen) return null;
  return (
    <div className="cart-add-toast" role="status">
      <strong>{cart.notice}</strong>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={cart.openCart} className="btn btn-primary btn-sm">View Cart</button>
        <button type="button" className="btn btn-outline btn-sm">Continue Shopping</button>
      </div>
    </div>
  );
}
