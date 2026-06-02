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

type ProductOption = {
  value: string;
  label: string;
  price?: number;
  variantId?: string;
};

const storageImageUrl = (value?: string | null) => {
  if (!value) return "";
  if (value.startsWith("storage:")) {
    return `/api/digital/thumbnail/${encodeURIComponent(value.slice("storage:".length))}`;
  }
  return value;
};

const isStoredImageValue = (value: string) =>
  /^https?:\/\//i.test(value) || value.startsWith("data:image/") || value.startsWith("storage:");

const getProductImages = (imageUrl?: string | null) => {
  if (!imageUrl) return [];
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((url): url is string => typeof url === "string" && isStoredImageValue(url));
    } catch {
      return [];
    }
  }
  return isStoredImageValue(trimmed) ? [trimmed] : [];
};

const getProductCoverImage = (product: Product) => getProductImages(product.imageUrl)[0] || "";

const parseProductOption = (value: string, fallbackPrice: number): ProductOption | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^"?variantId"?\s*:/i.test(trimmed) || /^"?price"?\s*:/i.test(trimmed)) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const price = Number.parseFloat(String(parsed?.price || ""));
      return {
        value,
        label: String(parsed?.label || value),
        price: Number.isFinite(price) && price > 0 ? price : fallbackPrice,
        variantId: parsed?.variantId ? String(parsed.variantId) : undefined,
      };
    } catch {
      const labelMatch = trimmed.match(/"label"\s*:\s*"([^"]+)/i);
      if (!labelMatch?.[1]) return null;
      return { value, label: labelMatch[1], price: fallbackPrice };
    }
  }
  const cleaned = trimmed.replace(/^"+|"+$/g, "").replace(/[{}]/g, "").trim();
  if (!cleaned || /^(label|variantId|price)\s*:/i.test(cleaned)) return null;
  return { value, label: cleaned, price: fallbackPrice };
};

const repairOptionValues = (values: string[]) => {
  const repaired: string[] = [];
  let buffer = "";

  for (const value of values) {
    const part = String(value || "").trim();
    if (!part) continue;

    if (buffer) {
      buffer += `,${part}`;
      if (part.includes("}")) {
        repaired.push(buffer);
        buffer = "";
      }
      continue;
    }

    if (part.startsWith("{") && !part.includes("}")) {
      buffer = part;
      continue;
    }

    if (/^"?variantId"?\s*:/i.test(part) || /^"?price"?\s*:/i.test(part)) continue;
    repaired.push(part);
  }

  if (buffer) repaired.push(buffer);
  return repaired;
};

const getProductOptions = (product: Product) => {
  const basePrice = Number.parseFloat(product.price);
  const fallbackPrice = Number.isFinite(basePrice) ? basePrice : 0;
  return repairOptionValues(Array.isArray(product.sizes) ? product.sizes : [])
    .map(size => parseProductOption(size, fallbackPrice))
    .filter((option): option is ProductOption => !!option && !!option.label);
};

const getSelectedProductOption = (product: Product, selectedSizes: Record<number, string>) => {
  const options = getProductOptions(product);
  const selectedValue = selectedSizes[product.id] || options[0]?.value || "";
  return options.find(option => option.value === selectedValue) || options[0] || parseProductOption(selectedValue, Number.parseFloat(product.price));
};

const getProductDisplayPrice = (product: Product, selectedSizes: Record<number, string>) => {
  const options = getProductOptions(product).filter(option => Number.isFinite(option.price || NaN) && (option.price || 0) > 0);
  const selected = getSelectedProductOption(product, selectedSizes);
  if (selected?.price) return `$${selected.price.toFixed(2)}`;
  if (options.length > 1) {
    const prices = Array.from(new Set(options.map(option => option.price as number))).sort((a, b) => a - b);
    if (prices.length > 1) return `$${prices[0].toFixed(2)} - $${prices[prices.length - 1].toFixed(2)}`;
  }
  return `$${Number.parseFloat(product.price).toFixed(2)}`;
};

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<Record<number, string>>({});
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [viewImage, setViewImage] = useState("");
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

  useEffect(() => {
    if (!viewProduct) return;
    const firstImage = getProductCoverImage(viewProduct);
    setViewImage(firstImage);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewProduct(null);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewProduct]);

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
  const shouldHidePrice = (product: Product) => ["Featured", "New Release", "Coming Soon"].includes(getProductStatus(product));
  const shouldHideOptions = (product: Product) => ["Featured", "New Release", "Coming Soon"].includes(getProductStatus(product));
  const isPurchasable = (product: Product) => product.inStock && !["Coming Soon", "New Release", "Featured"].includes(getProductStatus(product));
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
    const options = getProductOptions(product);
    const size = selectedSizes[product.id] || (options[0]?.value ?? "");
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id && i.size === size);
      if (existing) return prev.map(i => i.product.id === product.id && i.size === size ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1, size }];
    });
    setCartOpen(true);
  };

  const cartTotal = cart.reduce((sum, i) => sum + (parseProductOption(i.size, parseFloat(i.product.price))?.price || parseFloat(i.product.price)) * i.quantity, 0);

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
      const items = cart.map(i => {
        const option = parseProductOption(i.size, parseFloat(i.product.price));
        return {
          variantId: option?.variantId,
          productId: i.product.id,
          name: `${i.product.name}${option?.label ? ` (${option.label})` : ""}`,
          size: i.size,
          priceUSD: option?.price || parseFloat(i.product.price),
          quantity: i.quantity,
          image: getProductCoverImage(i.product).startsWith("http") ? getProductCoverImage(i.product) : undefined,
        };
      });
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
                {getProductCoverImage(item.product) && <img src={storageImageUrl(getProductCoverImage(item.product))} alt={item.product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.9rem", marginBottom: 4 }}>{item.product.name}</p>
                {item.size && <p style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 4 }}>Option: {parseProductOption(item.size, parseFloat(item.product.price))?.label || item.size}</p>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem" }}>${(((parseProductOption(item.size, parseFloat(item.product.price))?.price || parseFloat(item.product.price)) * item.quantity)).toFixed(2)}</span>
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

  const modalImages = viewProduct ? getProductImages(viewProduct.imageUrl) : [];
  const modalCoverImage = viewProduct ? getProductCoverImage(viewProduct) : "";
  const activeModalImage = viewImage || modalCoverImage;
  const activeModalImageIndex = Math.max(0, modalImages.indexOf(activeModalImage));
  const showModalImage = (direction: "prev" | "next") => {
    if (modalImages.length === 0) return;
    const nextIndex = direction === "next"
      ? (activeModalImageIndex + 1) % modalImages.length
      : (activeModalImageIndex - 1 + modalImages.length) % modalImages.length;
    setViewImage(modalImages[nextIndex]);
  };

  const productModal = viewProduct ? createPortal(
    <div className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
      <div className="cart-drawer__backdrop" aria-hidden="true" onClick={() => { setViewProduct(null); setViewImage(""); }} />
      <aside className="cart-drawer__panel" style={{ width: "min(960px, 100vw)", maxWidth: "100vw" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
              {getCategoryAudienceLabel(viewProduct.category)} / {getCategoryLabel(viewProduct.category)}
            </p>
            <h3 id="product-detail-title" style={{ fontSize: "1rem" }}>{viewProduct.name}</h3>
          </div>
          <button onClick={() => { setViewProduct(null); setViewImage(""); }} aria-label="Close product details" style={{ background: "none", border: "none", color: "var(--text2)", fontSize: "1.2rem" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.75fr)", gap: 24 }}>
            <div>
              {modalImages.length > 0 ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ aspectRatio: "4/5", background: "var(--bg3)", overflow: "hidden", borderRadius: 10, position: "relative" }}>
                    <img src={storageImageUrl(activeModalImage)} alt={viewProduct.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    {modalImages.length > 1 && (
                      <>
                        <button type="button" onClick={() => showModalImage("prev")} aria-label="Previous product image" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(0,0,0,0.58)", color: "#fff", cursor: "pointer", fontSize: "1.2rem" }}>‹</button>
                        <button type="button" onClick={() => showModalImage("next")} aria-label="Next product image" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(0,0,0,0.58)", color: "#fff", cursor: "pointer", fontSize: "1.2rem" }}>›</button>
                        <span style={{ position: "absolute", right: 12, bottom: 12, padding: "5px 9px", borderRadius: 999, background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: "0.72rem" }}>
                          {activeModalImageIndex + 1} / {modalImages.length}
                        </span>
                      </>
                    )}
                  </div>
                  {modalImages.length > 1 && (
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "2px 2px 8px" }}>
                      {modalImages.map((image, index) => (
                        <button key={`${image}-${index}`} type="button" onClick={() => setViewImage(image)} aria-label={`View ${viewProduct.name} image ${index + 1}`} style={{ padding: 0, background: "transparent", border: activeModalImage === image ? "3px solid var(--red)" : "1px solid var(--border)", borderRadius: 10, cursor: "pointer", overflow: "hidden", flex: "0 0 112px", boxShadow: activeModalImage === image ? "0 0 0 2px rgba(192,57,43,0.25)" : "none" }}>
                          <img src={storageImageUrl(image)} alt={`${viewProduct.name} mockup ${index + 1}`} style={{ width: 112, height: 112, objectFit: "cover", display: "block" }} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ aspectRatio: "4/5", background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", borderRadius: 10 }}>No Image</div>
              )}
            </div>

            <div>
              {getProductStatus(viewProduct) && <span className="badge badge-red">{getProductStatus(viewProduct)}</span>}
              <h2 style={{ margin: "14px 0 10px", fontSize: "1.35rem" }}>{viewProduct.name}</h2>
              {!shouldHidePrice(viewProduct) && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem" }}>{getProductDisplayPrice(viewProduct, selectedSizes)}</span>
                  {viewProduct.compareAtPrice && <span style={{ color: "var(--text3)", textDecoration: "line-through" }}>${parseFloat(viewProduct.compareAtPrice).toFixed(2)}</span>}
                </div>
              )}
              {viewProduct.description && <p style={{ color: "var(--text2)", lineHeight: 1.7, marginBottom: 18, whiteSpace: "pre-line" }}>{viewProduct.description}</p>}
              {!shouldHideOptions(viewProduct) && getProductOptions(viewProduct).length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
                  {getProductOptions(viewProduct).map(option => (
                    <button key={option.value} onClick={() => setSelectedSizes(prev => ({ ...prev, [viewProduct.id]: option.value }))}
                      style={{ padding: "6px 12px", fontSize: "0.72rem", fontFamily: "var(--font-display)", letterSpacing: "0.05em",
                        background: (selectedSizes[viewProduct.id] || getProductOptions(viewProduct)[0]?.value) === option.value ? "var(--red)" : "var(--bg3)",
                        color: (selectedSizes[viewProduct.id] || getProductOptions(viewProduct)[0]?.value) === option.value ? "#fff" : "var(--text2)",
                        border: "1px solid var(--border)", borderRadius: 2, cursor: "pointer" }}>
                      {option.label}{option.price && !shouldHidePrice(viewProduct) ? ` - $${option.price.toFixed(2)}` : ""}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => addToCart(viewProduct)} disabled={!isPurchasable(viewProduct)} className="btn btn-primary" style={{ width: "100%", marginBottom: 10 }}>
                {isPurchasable(viewProduct) ? "Add to Cart" : (getProductStatus(viewProduct) || "Not Available")}
              </button>
              <button onClick={() => { setViewProduct(null); setViewImage(""); }} className="btn btn-outline" style={{ width: "100%" }}>Back to Collection</button>
            </div>
          </div>
        </div>
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
                    <img src={storageImageUrl(coverImage)} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                        <img key={`${image}-${index}`} src={storageImageUrl(image)} alt={`${p.name} view ${index + 1}`} style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 4, border: index === 0 ? "1px solid var(--red)" : "1px solid var(--border)", flex: "0 0 auto" }} />
                      ))}
                    </div>
                  )}
                  <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                    {getCategoryAudienceLabel(p.category)} / {getCategoryLabel(p.category)}
                  </div>
                  <h3 style={{ fontSize: "0.95rem", marginBottom: 6 }}>{p.name}</h3>
                  {!shouldHidePrice(p) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "1rem" }}>{getProductDisplayPrice(p, selectedSizes)}</span>
                      {p.compareAtPrice && <span style={{ color: "var(--text3)", textDecoration: "line-through", fontSize: "0.8rem" }}>${parseFloat(p.compareAtPrice).toFixed(2)}</span>}
                    </div>
                  )}
                  {!shouldHideOptions(p) && getProductOptions(p).length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                      {getProductOptions(p).map(option => (
                        <button key={option.value} onClick={() => setSelectedSizes(prev => ({ ...prev, [p.id]: option.value }))}
                          style={{ padding: "4px 10px", fontSize: "0.7rem", fontFamily: "var(--font-display)", letterSpacing: "0.05em",
                            background: (selectedSizes[p.id] || getProductOptions(p)[0]?.value) === option.value ? "var(--red)" : "var(--bg3)",
                            color: (selectedSizes[p.id] || getProductOptions(p)[0]?.value) === option.value ? "#fff" : "var(--text2)",
                            border: "1px solid var(--border)", borderRadius: 2, cursor: "pointer" }}>
                          {option.label}{option.price && !shouldHidePrice(p) ? ` - $${option.price.toFixed(2)}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                    <button onClick={() => setViewProduct(p)} className="btn btn-outline btn-sm" style={{ width: "100%" }}>
                      View
                    </button>
                    <button onClick={() => addToCart(p)} disabled={!isPurchasable(p)} className="btn btn-primary btn-sm" style={{ width: "100%" }}>
                      {isPurchasable(p) ? "Add to Cart" : (getProductStatus(p) || "Not Available")}
                    </button>
                  </div>
                </div>
              </div>
            );})}
          </div>
        )}
      </div>

      {cartDrawer}
      {productModal}
    </div>
  );
}
