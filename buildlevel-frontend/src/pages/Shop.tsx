import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GymMotivationSection } from "../components/PromoVisualSections";
import { publicApi, Product } from "../lib/api";
import {
  APPAREL_AUDIENCES,
  getAudienceLabel,
  getCategoriesForAudience,
  getCategoryAudienceLabel,
  getCategoryLabel,
  getKnownAudienceForCategory,
  getAudienceForCategory,
  STOREFRONT_CATEGORY_PRIORITY,
  type ApparelAudience,
} from "../lib/apparelCategories";

interface CartItem { product: Product; quantity: number; size: string; }

const getProductImages = (imageUrl?: string | null) => {
  if (!imageUrl) return [];
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url));
    } catch {
      return [];
    }
  }
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:image/") ? [trimmed] : [];
};

const getProductCoverImage = (product: Product) => getProductImages(product.imageUrl)[0] || "";

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<Record<number, string>>({});
  const [audience, setAudience] = useState<"all" | ApparelAudience>("all");
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

  const normalizedBadge = (product: Product) => (product.badge || "").trim().toLowerCase();
  const getProductStatus = (product: Product) => {
    const badge = normalizedBadge(product);
    if (badge.includes("coming") || badge.includes("soon") || badge.includes("preorder")) return "Coming Soon";
    if (badge.includes("limited")) return "Limited Edition";
    if (badge.includes("new")) return "New Release";
    if (product.featured) return "Featured";
    if (product.inStock) return "Available";
    return "";
  };
  const isPurchasable = (product: Product) => product.inStock && getProductStatus(product) !== "Coming Soon";
  const qualifiesForStorefront = (product: Product) => {
    if (product.published === false || product.hidden === true || product.delisted === true) return false;
    return ["Available", "Coming Soon", "Featured", "New Release", "Limited Edition"].includes(getProductStatus(product));
  };
  const storefrontProducts = products.filter(qualifiesForStorefront);
  const audienceHasProducts = (value: ApparelAudience) =>
    storefrontProducts.some(product => getAudienceForCategory(product.category) === value);
  const audienceFiltered = audience === "all"
    ? storefrontProducts
    : storefrontProducts.filter(p => getAudienceForCategory(p.category) === audience);
  const sortCategories = (categories: string[]) => {
    const priority = (audience === "all" ? ["mens", "womens", "kids"].flatMap(a => STOREFRONT_CATEGORY_PRIORITY[a as ApparelAudience]) : STOREFRONT_CATEGORY_PRIORITY[audience]) || [];
    return categories.sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return getCategoryLabel(a).localeCompare(getCategoryLabel(b));
    });
  };
  const availableCategories = sortCategories(Array.from(new Set(audienceFiltered.map(p => p.category).filter(Boolean))));
  const filtered = category === "all" ? audienceFiltered : audienceFiltered.filter(p => p.category === category);

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
      const items = cart.map(i => ({
        productId: i.product.id,
        name: `${i.product.name}${i.size ? ` (${i.size})` : ""}`,
        size: i.size,
        priceUSD: parseFloat(i.product.price),
        quantity: i.quantity,
        image: getProductCoverImage(i.product).startsWith("http") ? getProductCoverImage(i.product) : undefined,
      }));
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
                {getProductCoverImage(item.product) && <img src={getProductCoverImage(item.product)} alt={item.product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
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

      <GymMotivationSection compact />

      <div className="container section-sm">
        {/* Filters + Cart button */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 32, gap: 14 }}>
          {storefrontProducts.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { setAudience("all"); setCategory("all"); }} className="btn btn-sm"
                style={{ background: audience === "all" ? "var(--red)" : "var(--bg3)", color: audience === "all" ? "#fff" : "var(--text2)", border: "1px solid var(--border)" }}>
                All Apparel
              </button>
              {APPAREL_AUDIENCES.filter(a => audienceHasProducts(a.value)).map(a => (
                <button key={a.value} onClick={() => { setAudience(a.value); setCategory("all"); }} className="btn btn-sm"
                  style={{ background: audience === a.value ? "var(--red)" : "var(--bg3)", color: audience === a.value ? "#fff" : "var(--text2)", border: "1px solid var(--border)" }}>
                  {a.label}
                </button>
              ))}
            </div>
            {cart.length > 0 && (
              <button onClick={() => setCartOpen(true)} className="btn btn-primary">
                Cart ({cart.reduce((s, i) => s + i.quantity, 0)}) — ${cartTotal.toFixed(2)}
              </button>
            )}
          </div>}
          {availableCategories.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setCategory("all")} className="btn btn-sm"
              style={{ background: category === "all" ? "var(--red)" : "transparent", color: category === "all" ? "#fff" : "var(--text2)", border: "1px solid var(--border)" }}>
              {audience === "all" ? "All Categories" : `All ${getAudienceLabel(audience)}`}
            </button>
            {availableCategories.map(c => (
              <button key={c} onClick={() => setCategory(c)} className="btn btn-sm"
                style={{ background: category === c ? "var(--red)" : "transparent", color: category === c ? "#fff" : "var(--text2)", border: "1px solid var(--border)" }}>
                {getCategoryLabel(c)}
              </button>
            ))}
          </div>}
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "72px 24px", color: "var(--text2)", border: "1px solid var(--border)", background: "var(--bg2)", borderRadius: 8 }}>
            <p style={{ fontFamily: "var(--font-display)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--red)", fontSize: "0.78rem", marginBottom: 10 }}>Next Drop Loading</p>
            <p style={{ fontSize: "1rem" }}>The next BUILD LEVEL release is being prepared.</p>
          </div>
        ) : (
          <div className="grid-4">
            {filtered.map(p => {
              const productImages = getProductImages(p.imageUrl);
              const coverImage = productImages[0] || "";
              return (
              <div key={p.id} className="card">
                <div style={{ aspectRatio: "4/5", background: "var(--bg3)", overflow: "hidden", position: "relative" }}>
                  {coverImage ? (
                    <img src={coverImage} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text3)", fontSize: "0.8rem" }}>No Image</div>
                  )}
                  {getProductStatus(p) && getProductStatus(p) !== "Available" && <span className="badge badge-red" style={{ position: "absolute", top: 12, left: 12 }}>{getProductStatus(p)}</span>}
                  {!isPurchasable(p) && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.42)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ color: "#fff", fontFamily: "var(--font-display)", letterSpacing: "0.1em" }}>{getProductStatus(p) || "Unavailable"}</span></div>}
                </div>
                <div style={{ padding: 16 }}>
                  {productImages.length > 1 && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
                      {productImages.slice(0, 6).map((image, index) => (
                        <img key={`${image}-${index}`} src={image} alt={`${p.name} view ${index + 1}`} style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 4, border: index === 0 ? "1px solid var(--red)" : "1px solid var(--border)", flex: "0 0 auto" }} />
                      ))}
                    </div>
                  )}
                  <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                    {getCategoryAudienceLabel(p.category)} / {getCategoryLabel(p.category)}
                  </div>
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
                  <button onClick={() => addToCart(p)} disabled={!isPurchasable(p)} className="btn btn-primary btn-sm" style={{ width: "100%" }}>
                    {isPurchasable(p) ? "Add to Cart" : (getProductStatus(p) === "Coming Soon" ? "Coming Soon" : "Not Available")}
                  </button>
                </div>
              </div>
            );})}
          </div>
        )}
      </div>

      {cartDrawer}
    </div>
  );
}
