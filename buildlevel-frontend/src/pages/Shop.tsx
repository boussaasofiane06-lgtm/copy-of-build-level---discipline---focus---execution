import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { publicApi, Product } from "../lib/api";

interface CartItem { product: Product; quantity: number; size: string; }

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<Record<number, string>>({});
  const [category, setCategory] = useState("all");
  const closeCartButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    publicApi.getProducts().then(p => { setProducts(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!cartOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeCartButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCartOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [cartOpen]);

  const categories = ["all", ...Array.from(new Set(products.map(p => p.category)))];
  const filtered = category === "all" ? products : products.filter(p => p.category === category);

  const addToCart = (product: Product) => {
    const sizes = Array.isArray(product.sizes) ? product.sizes : [];
    const size = selectedSizes[product.id] || (sizes[0] ?? "");
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id && i.size === size);
      if (existing) return prev.map(i => i.product.id === product.id && i.size === size ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1, size }];
    });
    setCartOpen(true);
  };

  const cartTotal = cart.reduce((sum, i) => sum + parseFloat(i.product.price) * i.quantity, 0);

  const updateCartItemQuantity = (productId: number, size: string, quantity: number) => {
    setCart(prev => prev.map(item =>
      item.product.id === productId && item.size === size
        ? { ...item, quantity: Math.max(1, quantity) }
        : item
    ));
  };

  const removeCartItem = (productId: number, size: string) => {
    setCart(prev => prev.filter(item => !(item.product.id === productId && item.size === size)));
  };

  const checkout = async () => {
    if (!cart.length) return;
    setCheckingOut(true);
    try {
      const items = cart.map(i => ({ name: `${i.product.name}${i.size ? ` (${i.size})` : ""}`, priceUSD: parseFloat(i.product.price), quantity: i.quantity, image: i.product.imageUrl || undefined }));
      const { url } = await publicApi.createCheckout(items);
      window.location.assign(url);
    } catch (e) {
      alert("Checkout failed. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  };

  const cartDrawer = cartOpen ? createPortal(
    <div className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">
      <div
        className="cart-drawer__backdrop"
        aria-hidden="true"
        onClick={() => setCartOpen(false)}
      />
      <aside className="cart-drawer__panel">
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 id="cart-drawer-title" style={{ fontSize: "1rem" }}>Your Cart</h3>
          <button ref={closeCartButtonRef} onClick={() => setCartOpen(false)} aria-label="Close cart" style={{ background: "none", border: "none", color: "var(--text2)", fontSize: "1.2rem" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {cart.length === 0 ? (
            <p style={{ color: "var(--text2)", textAlign: "center", marginTop: 40 }}>Your cart is empty.</p>
          ) : cart.map((item) => (
            <div key={`${item.product.id}-${item.size || "default"}`} style={{ display: "flex", gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 64, height: 64, background: "var(--bg3)", flexShrink: 0, overflow: "hidden", borderRadius: 2 }}>
                {item.product.imageUrl && <img src={item.product.imageUrl} alt={item.product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.9rem", marginBottom: 4 }}>{item.product.name}</p>
                {item.size && <p style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 4 }}>Size: {item.size}</p>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem" }}>${(parseFloat(item.product.price) * item.quantity).toFixed(2)}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => updateCartItemQuantity(item.product.id, item.size, item.quantity - 1)}
                      aria-label={`Decrease quantity for ${item.product.name}`}
                      className="cart-drawer__quantity-button"
                    >
                      -
                    </button>
                    <span style={{ fontSize: "0.85rem", minWidth: 18, textAlign: "center" }}>{item.quantity}</span>
                    <button
                      onClick={() => updateCartItemQuantity(item.product.id, item.size, item.quantity + 1)}
                      aria-label={`Increase quantity for ${item.product.name}`}
                      className="cart-drawer__quantity-button"
                    >
                      +
                    </button>
                    <button onClick={() => removeCartItem(item.product.id, item.size)} aria-label={`Remove ${item.product.name} from cart`} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", marginLeft: 4 }}>✕</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {cart.length > 0 && (
          <div style={{ padding: 24, paddingBottom: "max(24px, env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: "var(--text2)" }}>Total</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>${cartTotal.toFixed(2)}</span>
            </div>
            <button onClick={checkout} disabled={checkingOut} className="btn btn-primary" style={{ width: "100%" }}>
              {checkingOut ? "Redirecting..." : "Checkout with Stripe"}
            </button>
          </div>
        )}
      </aside>
    </div>,
    document.body
  ) : null;

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "48px 0 32px" }}>
        <div className="container">
          <h1 style={{ marginBottom: 8 }}>The Collection</h1>
          <p style={{ color: "var(--text2)" }}>Premium apparel built for builders.</p>
        </div>
      </div>

      <div className="container section-sm">
        {/* Filters + Cart button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {categories.map(c => (
              <button key={c} onClick={() => setCategory(c)} className="btn btn-sm"
                style={{ background: category === c ? "var(--red)" : "var(--bg3)", color: category === c ? "#fff" : "var(--text2)", border: "1px solid var(--border)" }}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
          {cart.length > 0 && (
            <button onClick={() => setCartOpen(true)} className="btn btn-primary">
              Cart ({cart.reduce((s, i) => s + i.quantity, 0)}) — ${cartTotal.toFixed(2)}
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--text2)" }}>
            <p style={{ fontSize: "1.1rem", marginBottom: 8 }}>No products available yet.</p>
            <p style={{ fontSize: "0.9rem" }}>Check back soon.</p>
          </div>
        ) : (
          <div className="grid-4">
            {filtered.map(p => (
              <div key={p.id} className="card">
                <div style={{ aspectRatio: "4/5", background: "var(--bg3)", overflow: "hidden", position: "relative" }}>
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text3)", fontSize: "0.8rem" }}>No Image</div>
                  )}
                  {p.badge && <span className="badge badge-red" style={{ position: "absolute", top: 12, left: 12 }}>{p.badge}</span>}
                  {!p.inStock && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ color: "#fff", fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}>SOLD OUT</span></div>}
                </div>
                <div style={{ padding: 16 }}>
                  <h3 style={{ fontSize: "0.95rem", marginBottom: 6 }}>{p.name}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: "1rem" }}>${parseFloat(p.price).toFixed(2)}</span>
                    {p.compareAtPrice && <span style={{ color: "var(--text3)", textDecoration: "line-through", fontSize: "0.8rem" }}>${parseFloat(p.compareAtPrice).toFixed(2)}</span>}
                  </div>
                  {(Array.isArray(p.sizes) ? p.sizes : []).length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                      {(Array.isArray(p.sizes) ? p.sizes : []).map(s => (
                        <button key={s} onClick={() => setSelectedSizes(prev => ({ ...prev, [p.id]: s }))}
                          style={{ padding: "4px 10px", fontSize: "0.7rem", fontFamily: "var(--font-display)", letterSpacing: "0.05em",
                            background: selectedSizes[p.id] === s ? "var(--red)" : "var(--bg3)",
                            color: selectedSizes[p.id] === s ? "#fff" : "var(--text2)",
                            border: "1px solid var(--border)", borderRadius: 2, cursor: "pointer" }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => addToCart(p)} disabled={!p.inStock} className="btn btn-primary btn-sm" style={{ width: "100%" }}>
                    {p.inStock ? "Add to Cart" : "Sold Out"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {cartDrawer}
    </div>
  );
}
