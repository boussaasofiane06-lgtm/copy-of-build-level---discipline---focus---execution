import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GymMotivationSection } from "../components/PromoVisualSections";
import { ProductReviewSummary, ProductReviews, RecommendationStrip, TrustBadges, type ReviewSummaryData } from "../components/Engagement";
import { publicApi, Product, ProductShopAssignment, ShopTaxonomy } from "../lib/api";
import { useCart } from "../context/CartContext";
import ReportProblemButton from "../components/ReportProblemButton";
import {
  APPAREL_AUDIENCES,
  getAudienceLabel,
  getCategoryLabel,
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
  size?: string;
  color?: string;
};

type VariantDimension = "size" | "color";
type ProductVariantSelection = Partial<Record<VariantDimension, string>>;

const priceSuffixPattern = /\s+-\s+\$?(\d+(?:\.\d{1,2})?)\s*$/;
const sizePattern = /^(?:XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|ONE SIZE|ONESIZE|OS|OSFA|\d+(?:\.\d+)?(?:OZ|ML|L|IN|CM)?)$/i;

const uniqueValues = (values: Array<string | undefined>) => {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const clean = String(value || "").trim();
    if (!clean || seen.has(clean)) return false;
    seen.add(clean);
    return true;
  });
};

const stripEmbeddedPrice = (label: string) => label.replace(priceSuffixPattern, "").trim();

const parseEmbeddedPrice = (label: string) => {
  const match = label.match(priceSuffixPattern);
  if (!match?.[1]) return NaN;
  return Number.parseFloat(match[1]);
};

const isLikelySize = (value: string) => sizePattern.test(value.trim().toUpperCase().replace(/\s+/g, ""));

const deriveOptionAttributes = (rawLabel: string) => {
  const label = stripEmbeddedPrice(rawLabel.replace(/^"+|"+$/g, "").trim());
  const parts = label.split(/\s*\/\s*/).map(part => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    const sizePart = parts.find(isLikelySize);
    if (sizePart) {
      const colorParts = parts.filter(part => part !== sizePart);
      return { label, size: sizePart, color: colorParts.join(" / ") || undefined };
    }

    return { label, color: parts[0], size: parts.slice(1).join(" / ") };
  }

  if (isLikelySize(label)) return { label, size: label };
  return { label, color: /^default$/i.test(label) ? undefined : label };
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
      const rawLabel = String(parsed?.label || value);
      const price = Number.parseFloat(String(parsed?.price || "")) || parseEmbeddedPrice(rawLabel);
      const option = deriveOptionAttributes(rawLabel);
      return {
        value,
        label: option.label,
        price: Number.isFinite(price) && price > 0 ? price : fallbackPrice,
        variantId: parsed?.variantId ? String(parsed.variantId) : undefined,
        size: option.size,
        color: option.color,
      };
    } catch {
      const labelMatch = trimmed.match(/"label"\s*:\s*"([^"]+)/i);
      if (!labelMatch?.[1]) return null;
      const option = deriveOptionAttributes(labelMatch[1]);
      return { value, label: option.label, price: fallbackPrice, size: option.size, color: option.color };
    }
  }
  const cleaned = trimmed.replace(/^"+|"+$/g, "").replace(/[{}]/g, "").trim();
  if (!cleaned || /^(label|variantId|price)\s*:/i.test(cleaned)) return null;
  const embeddedPrice = parseEmbeddedPrice(cleaned);
  const option = deriveOptionAttributes(cleaned);
  return {
    value,
    label: option.label,
    price: Number.isFinite(embeddedPrice) && embeddedPrice > 0 ? embeddedPrice : fallbackPrice,
    size: option.size,
    color: option.color,
  };
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

const getProductVariantChoices = (product: Product) => {
  const options = getProductOptions(product);
  return {
    options,
    sizes: uniqueValues(options.map(option => option.size)),
    colors: uniqueValues(options.map(option => option.color)),
  };
};

const getEffectiveSelection = (product: Product, selections: Record<number, ProductVariantSelection>) => {
  const choices = getProductVariantChoices(product);
  const selection = selections[product.id] || {};
  return {
    size: choices.sizes.length === 1 ? choices.sizes[0] : selection.size,
    color: choices.colors.length === 1 ? choices.colors[0] : selection.color,
  };
};

const getSelectedProductOption = (product: Product, selections: Record<number, ProductVariantSelection>) => {
  const choices = getProductVariantChoices(product);
  const { options, sizes, colors } = choices;
  if (!options.length) return null;

  const selected = getEffectiveSelection(product, selections);
  if (sizes.length > 0 && !selected.size) return null;
  if (colors.length > 0 && !selected.color) return null;
  if (!sizes.length && !colors.length) return options[0];

  return options.find(option =>
    (!sizes.length || option.size === selected.size) &&
    (!colors.length || option.color === selected.color)
  ) || null;
};

const getProductDisplayPrice = (product: Product, selections: Record<number, ProductVariantSelection>) => {
  const choices = getProductVariantChoices(product);
  const selected = getSelectedProductOption(product, selections);
  if (selected?.price) return `$${selected.price.toFixed(2)}`;
  if (choices.options.length > 0 && (choices.sizes.length > 0 || choices.colors.length > 0)) {
    const missing = [
      choices.sizes.length > 1 && !getEffectiveSelection(product, selections).size ? "size" : "",
      choices.colors.length > 1 && !getEffectiveSelection(product, selections).color ? "color" : "",
    ].filter(Boolean).join(" and ");
    return missing ? `Select ${missing} for price` : "Select available options";
  }
  const options = getProductOptions(product).filter(option => Number.isFinite(option.price || NaN) && (option.price || 0) > 0);
  if (options.length > 1) {
    const prices = Array.from(new Set(options.map(option => option.price as number))).sort((a, b) => a - b);
    if (prices.length > 1) return `$${prices[0].toFixed(2)} - $${prices[prices.length - 1].toFixed(2)}`;
  }
  return `$${Number.parseFloat(product.price).toFixed(2)}`;
};

export default function Shop() {
  const globalCart = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [variantSelections, setVariantSelections] = useState<Record<number, ProductVariantSelection>>({});
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [viewImage, setViewImage] = useState("");
  const [productReviews, setProductReviews] = useState<ReviewSummaryData>({ reviews: [], averageRating: 0, count: 0 });
  const [reviewSummaries, setReviewSummaries] = useState<Record<number, ReviewSummaryData>>({});
  const [taxonomy, setTaxonomy] = useState<ShopTaxonomy | null>(null);
  const [audience, setAudience] = useState("all");
  const [category, setCategory] = useState("all");
  const closeCartButtonRef = useRef<HTMLButtonElement>(null);
  const productModalScrollRef = useRef<HTMLDivElement>(null);
  const modalTouchStartXRef = useRef<number | null>(null);
  const [modalImageLoading, setModalImageLoading] = useState(false);
  const [modalImageError, setModalImageError] = useState(false);
  const [likedProducts, setLikedProducts] = useState<Record<number, boolean>>({});
  const [reviewForm, setReviewForm] = useState({ customerName: "", email: "", rating: 5, reviewText: "" });
  const [reviewMessage, setReviewMessage] = useState("");

  useEffect(() => {
    publicApi.getProducts().then(p => { setProducts(p); setLoading(false); }).catch(() => setLoading(false));
    publicApi.getShopTaxonomy().then(setTaxonomy).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!products.length) return;
    Promise.all(products.slice(0, 24).map(product =>
      publicApi.getReviews({ targetType: "product", targetId: product.id, limit: 4 })
        .then(summary => [product.id, summary] as const)
        .catch(() => [product.id, { reviews: [], averageRating: 0, count: 0 }] as const)
    )).then(entries => setReviewSummaries(Object.fromEntries(entries)));
  }, [products]);

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
    setModalImageError(false);
    setModalImageLoading(!!firstImage);
    requestAnimationFrame(() => {
      productModalScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
    publicApi.getReviews({ targetType: "product", targetId: viewProduct.id, limit: 6 })
      .then(setProductReviews)
      .catch(() => setProductReviews({ reviews: [], averageRating: 0, count: 0 }));
    setReviewForm({ customerName: "", email: "", rating: 5, reviewText: "" });
    setReviewMessage("");

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
  const productAssignments = taxonomy?.productAssignments || [];
  const getAssignmentRows = (productId: number) => productAssignments.filter(item => Number(item.productId) === productId);
  const getPrimaryAssignment = (product: Product): ProductShopAssignment | undefined =>
    getAssignmentRows(product.id).find(item => item.audienceSlug);
  const isCanCoolerProduct = (product: Product) => /can cooler|koozie/i.test(`${product.name} ${product.description || ""}`);
  const getProductAudienceSlug = (product: Product) => getPrimaryAssignment(product)?.audienceSlug || (isCanCoolerProduct(product) ? "home-living" : getAudienceForCategory(product.category));
  const getProductCategorySlug = (product: Product) => {
    const rows = getAssignmentRows(product.id);
    return rows.find(row => row.assignmentType === "subcategory")?.categorySlug || rows.find(row => row.assignmentType === "primary")?.categorySlug || (isCanCoolerProduct(product) ? "can-coolers" : product.category);
  };
  const getDynamicAudienceLabel = (slug?: string | null) =>
    taxonomy?.audiences.find(item => item.slug === slug)?.name || (slug ? getAudienceLabel(slug as ApparelAudience) : "Legacy");
  const getDynamicCategoryLabel = (slug?: string | null) =>
    taxonomy?.categories.find(item => item.slug === slug)?.name || getCategoryLabel(slug);
  const parseStyleSettings = (value: unknown) => {
    if (!value) return {};
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch { return {}; }
    }
    return value as Record<string, string>;
  };
  const getAudienceStyle = (slug?: string | null) => parseStyleSettings(taxonomy?.audiences.find(item => item.slug === slug)?.styleSettings);
  const getCategoryStyle = (slug?: string | null) => parseStyleSettings(taxonomy?.categories.find(item => item.slug === slug)?.styleSettings);
  const textCase = (text: string, style: Record<string, string>) => {
    if (style.textCase === "uppercase") return text.toUpperCase();
    if (style.textCase === "lowercase") return text.toLowerCase();
    if (style.textCase === "title") return text.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
    if (style.textCase === "sentence") return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    return text;
  };
  const labelStyle = (style: Record<string, string>): React.CSSProperties => ({
    color: style.textColor || undefined,
    background: style.backgroundColor || undefined,
    borderColor: style.borderColor || undefined,
    fontSize: style.fontSize ? `${Math.min(42, Math.max(10, Number(style.fontSize) || 16))}px` : undefined,
    fontWeight: style.fontWeight || undefined,
    letterSpacing: style.letterSpacing ? `${style.letterSpacing}em` : undefined,
    lineHeight: style.lineHeight || undefined,
    textAlign: style.textAlign as any,
    fontStyle: style.fontStyle === "italic" ? "italic" : undefined,
    textDecoration: style.fontStyle === "underline" ? "underline" : style.fontStyle === "strike" ? "line-through" : undefined,
  });
  const publicAudiences = taxonomy?.audiences?.length
    ? Array.from(new Map(taxonomy.audiences.filter(item => Boolean(item.enabled) && !Boolean(item.hidden)).map(item => [item.slug, { value: item.slug, label: item.name, isForYou: Boolean(item.isForYou) }])).values())
    : APPAREL_AUDIENCES.map(item => ({ ...item, isForYou: false }));
  const isAssignedToForYou = (product: Product) => getProductAudienceSlug(product) === "for-you" || getAssignmentRows(product.id).some(item => item.audienceSlug === "for-you");
  const audienceHasProducts = (value: string) =>
    value === "for-you"
      ? storefrontProducts.some(product => isAssignedToForYou(product) || product.featured || getProductStatus(product) === "New Release")
      : storefrontProducts.some(product => getProductAudienceSlug(product) === value);
  const audienceFiltered = audience === "all"
    ? storefrontProducts
    : audience === "for-you"
      ? storefrontProducts.filter(product => isAssignedToForYou(product) || product.featured || getProductStatus(product) === "New Release")
      : storefrontProducts.filter(p => getProductAudienceSlug(p) === audience);
  const sortCategories = (categories: string[]) => {
    const priority = (audience === "all" ? ["mens", "womens", "kids"].flatMap(a => STOREFRONT_CATEGORY_PRIORITY[a as ApparelAudience] || []) : STOREFRONT_CATEGORY_PRIORITY[audience as ApparelAudience]) || [];
    return categories.sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return getDynamicCategoryLabel(a).localeCompare(getDynamicCategoryLabel(b));
    });
  };
  const availableCategories = sortCategories(Array.from(new Set(audienceFiltered.map(p => getProductCategorySlug(p)).filter(Boolean))));
  const filtered = category === "all" ? audienceFiltered : audienceFiltered.filter(p => getProductCategorySlug(p) === category);
  const getRecommendations = (product: Product) =>
    storefrontProducts
      .filter(item => item.id !== product.id)
      .sort((a, b) => Number(b.featured) - Number(a.featured))
      .filter(item => item.category === product.category || item.featured)
      .slice(0, 4);

  const variantChoiceStyle = (active: boolean, compact = false, disabled = false): React.CSSProperties => ({
    padding: compact ? "6px 10px" : "8px 12px",
    fontSize: compact ? "0.68rem" : "0.72rem",
    fontFamily: "var(--font-display)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    background: active ? "var(--red)" : "var(--bg3)",
    color: active ? "#fff" : "var(--text2)",
    border: "1px solid var(--border)",
    borderRadius: 2,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.42 : 1,
  });

  const isChoiceAvailable = (product: Product, dimension: VariantDimension, value: string) => {
    const choices = getProductVariantChoices(product);
    const selected = getEffectiveSelection(product, variantSelections);
    return choices.options.some(option => {
      if (dimension === "size") {
        return option.size === value && (!choices.colors.length || !selected.color || option.color === selected.color);
      }
      return option.color === value && (!choices.sizes.length || !selected.size || option.size === selected.size);
    });
  };

  const updateVariantSelection = (product: Product, dimension: VariantDimension, value: string) => {
    setVariantSelections(prev => {
      const nextSelection: ProductVariantSelection = { ...(prev[product.id] || {}), [dimension]: value };
      const choices = getProductVariantChoices(product);
      if (dimension === "size" && nextSelection.color && !choices.options.some(option => option.size === value && option.color === nextSelection.color)) {
        delete nextSelection.color;
      }
      if (dimension === "color" && nextSelection.size && !choices.options.some(option => option.color === value && option.size === nextSelection.size)) {
        delete nextSelection.size;
      }
      return { ...prev, [product.id]: nextSelection };
    });
  };

  const renderVariantSelectors = (product: Product, compact = false) => {
    if (shouldHideOptions(product)) return null;
    const choices = getProductVariantChoices(product);
    if (!choices.options.length || (!choices.sizes.length && !choices.colors.length)) return null;
    const selected = getEffectiveSelection(product, variantSelections);
    const selectedOption = getSelectedProductOption(product, variantSelections);
    const missing = [
      choices.sizes.length > 1 && !selected.size ? "size" : "",
      choices.colors.length > 1 && !selected.color ? "color" : "",
    ].filter(Boolean).join(" and ");

    return (
      <div style={{ display: "grid", gap: compact ? 8 : 12, marginBottom: compact ? 12 : 18 }}>
        {choices.sizes.length > 0 && (
          <div>
            <p style={{ color: "var(--text3)", fontFamily: "var(--font-display)", fontSize: "0.68rem", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Select Size</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {choices.sizes.map(size => {
                const disabled = !isChoiceAvailable(product, "size", size);
                return (
                  <button key={size} type="button" disabled={disabled} onClick={() => updateVariantSelection(product, "size", size)}
                    style={variantChoiceStyle(selected.size === size, compact, disabled)}>
                    {size}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {choices.colors.length > 0 && (
          <div>
            <p style={{ color: "var(--text3)", fontFamily: "var(--font-display)", fontSize: "0.68rem", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>Select Color</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {choices.colors.map(color => {
                const disabled = !isChoiceAvailable(product, "color", color);
                return (
                  <button key={color} type="button" disabled={disabled} onClick={() => updateVariantSelection(product, "color", color)}
                    style={variantChoiceStyle(selected.color === color, compact, disabled)}>
                    {color}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!selectedOption && missing && (
          <p style={{ color: "var(--text3)", fontSize: compact ? "0.72rem" : "0.8rem" }}>
            Choose a {missing} to see the price.
          </p>
        )}
      </div>
    );
  };

  const canAddProductToCart = (product: Product) => isPurchasable(product) && (!getProductOptions(product).length || !!getSelectedProductOption(product, variantSelections));
  const getAddToCartLabel = (product: Product) => {
    if (!isPurchasable(product)) return getProductStatus(product) || "Not Available";
    if (getProductOptions(product).length && !getSelectedProductOption(product, variantSelections)) return "Select Options";
    return "Add to Cart";
  };

  const submitProductReview = async (product: Product) => {
    if (!reviewForm.customerName.trim() || !reviewForm.reviewText.trim()) {
      setReviewMessage("Add your name and review before submitting.");
      return;
    }
    try {
      await publicApi.submitReview({
        targetType: "product",
        targetId: product.id,
        customerName: reviewForm.customerName,
        email: reviewForm.email,
        rating: reviewForm.rating,
        reviewText: reviewForm.reviewText,
        sessionId: `product-${product.id}-${Date.now()}`,
      });
      setReviewMessage("Thank you. Your review was submitted for approval.");
      setReviewForm({ customerName: "", email: "", rating: 5, reviewText: "" });
    } catch (error: any) {
      setReviewMessage(error?.response?.data?.error || "Review could not be submitted.");
    }
  };

  const shareProduct = async (product: Product) => {
    const url = `${window.location.origin}/shop`;
    const text = `I recommend ${product.name} from Build Level.`;
    try {
      if (navigator.share) await navigator.share({ title: product.name, text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setReviewMessage("Product link copied.");
      }
    } catch {
      // Customer cancelled native share.
    }
  };

  const renderProductActions = (product: Product) => (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, margin: "18px 0", background: "rgba(255,255,255,0.025)" }}>
      <h3 style={{ fontSize: "0.9rem", marginBottom: 10 }}>Review • Rate • Recommend</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setLikedProducts(prev => ({ ...prev, [product.id]: !prev[product.id] }))}>
          {likedProducts[product.id] ? "Liked" : "Like"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => shareProduct(product)}>Recommend / Share</button>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", color: "var(--text2)" }}>
          <span>Rate it:</span>
          {[1, 2, 3, 4, 5].map(star => (
            <button key={star} type="button" onClick={() => setReviewForm(form => ({ ...form, rating: star }))} style={{ border: 0, background: "transparent", color: star <= reviewForm.rating ? "#ff6600" : "var(--text3)", fontSize: 22, cursor: "pointer" }}>★</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          <input className="input" placeholder="Your name" value={reviewForm.customerName} onChange={event => setReviewForm(form => ({ ...form, customerName: event.target.value }))} />
          <input className="input" placeholder="Email (optional)" value={reviewForm.email} onChange={event => setReviewForm(form => ({ ...form, email: event.target.value }))} />
        </div>
        <textarea className="input" rows={3} placeholder="Write your review" value={reviewForm.reviewText} onChange={event => setReviewForm(form => ({ ...form, reviewText: event.target.value }))} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => submitProductReview(product)}>Submit Review</button>
        {reviewMessage && <p style={{ color: reviewMessage.includes("could not") || reviewMessage.includes("Add your") ? "var(--red)" : "#ff6600", fontSize: "0.82rem" }}>{reviewMessage}</p>}
      </div>
    </div>
  );

  const addToCart = (product: Product) => {
    const option = getSelectedProductOption(product, variantSelections);
    const selected = getEffectiveSelection(product, variantSelections);
    if (getProductOptions(product).length && !option) return;
    globalCart.addApparel({
      product,
      quantity: 1,
      unitPrice: option?.price || Number.parseFloat(product.price),
      selectedSize: selected.size || option?.size || "",
      selectedColor: selected.color || option?.color || "",
      selectedVariant: option?.value || option?.label || "",
      printifyVariantId: option?.variantId,
    });
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
  const selectModalImage = (image: string) => {
    setModalImageError(false);
    setModalImageLoading(!!image);
    setViewImage(image);
  };
  const showModalImage = (direction: "prev" | "next") => {
    if (modalImages.length === 0) return;
    const nextIndex = direction === "next"
      ? (activeModalImageIndex + 1) % modalImages.length
      : (activeModalImageIndex - 1 + modalImages.length) % modalImages.length;
    selectModalImage(modalImages[nextIndex]);
  };
  const handleModalImageTouchEnd = (clientX: number) => {
    const startX = modalTouchStartXRef.current;
    modalTouchStartXRef.current = null;
    if (startX == null || modalImages.length < 2) return;
    const delta = clientX - startX;
    if (Math.abs(delta) < 42) return;
    showModalImage(delta < 0 ? "next" : "prev");
  };

  const productModal = viewProduct ? createPortal(
    <div className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
      <div className="cart-drawer__backdrop" aria-hidden="true" onClick={() => { setViewProduct(null); setViewImage(""); }} />
      <aside className="cart-drawer__panel product-detail-panel" style={{ width: "min(960px, 100vw)", maxWidth: "100vw" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
              {getDynamicAudienceLabel(getProductAudienceSlug(viewProduct))} / {getDynamicCategoryLabel(getProductCategorySlug(viewProduct))}
            </p>
            <h3 id="product-detail-title" style={{ fontSize: "1rem" }}>{viewProduct.name}</h3>
          </div>
          <button onClick={() => { setViewProduct(null); setViewImage(""); }} aria-label="Close product details" style={{ background: "none", border: "none", color: "var(--text2)", fontSize: "1.2rem" }}>✕</button>
        </div>

        <div ref={productModalScrollRef} className="product-detail-scroll" style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div className="product-detail-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.75fr)", gap: 24 }}>
            <div>
              {modalImages.length > 0 ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <div
                    className="product-detail-main-image"
                    onTouchStart={event => { modalTouchStartXRef.current = event.touches[0]?.clientX ?? null; }}
                    onTouchEnd={event => handleModalImageTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
                    style={{ aspectRatio: "4/5", background: "var(--bg3)", overflow: "hidden", borderRadius: 10, position: "relative", touchAction: "pan-y" }}
                  >
                    {modalImageLoading && !modalImageError && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.18)", zIndex: 1 }}>
                        <div className="spinner" />
                      </div>
                    )}
                    {modalImageError ? (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", textAlign: "center", padding: 24 }}>Image unavailable</div>
                    ) : (
                      <img
                        src={storageImageUrl(activeModalImage)}
                        alt={viewProduct.name}
                        onLoad={() => setModalImageLoading(false)}
                        onError={() => { setModalImageLoading(false); setModalImageError(true); }}
                        style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", display: "block" }}
                      />
                    )}
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
                    <div className="product-detail-thumbnails" style={{ display: "flex", gap: 10, overflowX: "auto", padding: "2px 2px 8px" }}>
                      {modalImages.map((image, index) => (
                        <button key={`${image}-${index}`} type="button" onClick={() => selectModalImage(image)} aria-label={`View ${viewProduct.name} image ${index + 1}`} style={{ padding: 0, background: "var(--bg3)", border: activeModalImage === image ? "3px solid var(--red)" : "1px solid var(--border)", borderRadius: 10, cursor: "pointer", overflow: "hidden", flex: "0 0 112px", boxShadow: activeModalImage === image ? "0 0 0 2px rgba(192,57,43,0.25)" : "none" }}>
                          <img src={storageImageUrl(image)} alt={`${viewProduct.name} mockup ${index + 1}`} style={{ width: 112, height: 112, objectFit: "contain", display: "block", background: "var(--bg3)" }} />
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
              <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                {getDynamicAudienceLabel(getProductAudienceSlug(viewProduct))} / {getDynamicCategoryLabel(getProductCategorySlug(viewProduct))}
              </p>
              {getProductStatus(viewProduct) && <span className="badge badge-red">{getProductStatus(viewProduct)}</span>}
              <h2 style={{ margin: "14px 0 10px", fontSize: "1.35rem" }}>{viewProduct.name}</h2>
              {productReviews.count > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text2)", marginBottom: 14 }}>
                  <ProductReviewSummary summary={productReviews} />
                </div>
              )}
              {!shouldHidePrice(viewProduct) && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: getSelectedProductOption(viewProduct, variantSelections) || !getProductOptions(viewProduct).length ? "1.35rem" : "0.9rem", color: getSelectedProductOption(viewProduct, variantSelections) || !getProductOptions(viewProduct).length ? "var(--text)" : "var(--text2)" }}>{getProductDisplayPrice(viewProduct, variantSelections)}</span>
                  {getSelectedProductOption(viewProduct, variantSelections) && viewProduct.compareAtPrice && <span style={{ color: "var(--text3)", textDecoration: "line-through" }}>${parseFloat(viewProduct.compareAtPrice).toFixed(2)}</span>}
                </div>
              )}
              {renderVariantSelectors(viewProduct)}
              {getProductOptions(viewProduct).length > 0 && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 14, color: "var(--text2)", fontSize: "0.84rem" }}>
                  {getSelectedProductOption(viewProduct, variantSelections) ? (
                    <>
                      Selected: {getEffectiveSelection(viewProduct, variantSelections).color || "Default color"} / {getEffectiveSelection(viewProduct, variantSelections).size || "Default size"}
                    </>
                  ) : (
                    <>Select color and size before adding to cart.</>
                  )}
                </div>
              )}
              {viewProduct.description && <p style={{ color: "var(--text2)", lineHeight: 1.7, marginBottom: 18, whiteSpace: "pre-line" }}>{viewProduct.description}</p>}
              <div style={{ marginBottom: 18 }}><TrustBadges type="apparel" /></div>
              <div style={{ border: "1px solid rgba(255,102,0,0.35)", borderRadius: 10, padding: 12, margin: "18px 0", background: "rgba(255,102,0,0.06)" }}>
                <strong>Build Level Promise</strong>
                <p style={{ color: "var(--text2)", fontSize: "0.85rem", marginTop: 6 }}>Premium standards, secure checkout, and products selected for Discipline • Focus • Execution.</p>
              </div>
              <button onClick={() => addToCart(viewProduct)} disabled={!canAddProductToCart(viewProduct)} className="btn btn-primary" style={{ width: "100%", marginBottom: 10 }}>
                {getAddToCartLabel(viewProduct)}
              </button>
              <ReportProblemButton source="Product question" style={{ width: "100%", marginBottom: 10 }} />
              <button onClick={() => { setViewProduct(null); setViewImage(""); }} className="btn btn-outline" style={{ width: "100%" }}>Back to Collection</button>
              {renderProductActions(viewProduct)}
              <ProductReviews summary={productReviews} />
              <RecommendationStrip title="Customers Also Bought" products={getRecommendations(viewProduct)} hrefBase="/shop" />
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
            <div className="shop-filter-scroll" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { setAudience("all"); setCategory("all"); }} className="btn btn-sm"
                style={{ background: audience === "all" ? "var(--red)" : "var(--bg3)", color: audience === "all" ? "#fff" : "var(--text2)", border: "1px solid var(--border)" }}>
                All Apparel
              </button>
              {publicAudiences.map(a => (
                <button key={a.value} onClick={() => { setAudience(a.value); setCategory("all"); }} className="btn btn-sm"
                  style={{ background: audience === a.value ? "var(--red)" : "var(--bg3)", color: audience === a.value ? "#fff" : "var(--text2)", border: "1px solid var(--border)", ...labelStyle(getAudienceStyle(a.value)) }}>
                  {textCase(a.label, getAudienceStyle(a.value))}
                </button>
              ))}
            </div>
            {cart.length > 0 && (
              <button onClick={() => setCartOpen(true)} className="btn btn-primary">
                Cart ({cart.reduce((s, i) => s + i.quantity, 0)}) — ${cartTotal.toFixed(2)}
              </button>
            )}
          </div>}
          {availableCategories.length > 0 && <div className="shop-filter-scroll" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setCategory("all")} className="btn btn-sm"
              style={{ background: category === "all" ? "var(--red)" : "transparent", color: category === "all" ? "#fff" : "var(--text2)", border: "1px solid var(--border)" }}>
              {audience === "all" ? "All Categories" : `All ${getDynamicAudienceLabel(audience)}`}
            </button>
            {availableCategories.map(c => (
              <button key={c} onClick={() => setCategory(c)} className="btn btn-sm"
                style={{ background: category === c ? "var(--red)" : "transparent", color: category === c ? "#fff" : "var(--text2)", border: "1px solid var(--border)", ...labelStyle(getCategoryStyle(c)) }}>
                {textCase(getDynamicCategoryLabel(c), getCategoryStyle(c))}
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
                    {getDynamicAudienceLabel(getProductAudienceSlug(p))} / {getDynamicCategoryLabel(getProductCategorySlug(p))}
                  </div>
                  <h3 style={{ fontSize: "0.95rem", marginBottom: 6 }}>{p.name}</h3>
                  <div style={{ marginBottom: 10 }}><ProductReviewSummary summary={reviewSummaries[p.id]} compact /></div>
                  {!shouldHidePrice(p) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: getSelectedProductOption(p, variantSelections) || !getProductOptions(p).length ? "1rem" : "0.78rem", color: getSelectedProductOption(p, variantSelections) || !getProductOptions(p).length ? "var(--text)" : "var(--text2)" }}>{getProductDisplayPrice(p, variantSelections)}</span>
                      {getSelectedProductOption(p, variantSelections) && p.compareAtPrice && <span style={{ color: "var(--text3)", textDecoration: "line-through", fontSize: "0.8rem" }}>${parseFloat(p.compareAtPrice).toFixed(2)}</span>}
                    </div>
                  )}
                  {renderVariantSelectors(p, true)}
                  {getProductOptions(p).length > 0 && (
                    <p style={{ color: "var(--text3)", fontSize: "0.74rem", marginBottom: 10 }}>
                      {getSelectedProductOption(p, variantSelections)
                        ? `Selected: ${getEffectiveSelection(p, variantSelections).color || "Default color"} / ${getEffectiveSelection(p, variantSelections).size || "Default size"}`
                        : "Select color and size"}
                    </p>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                    <button onClick={() => setViewProduct(p)} className="btn btn-outline btn-sm" style={{ width: "100%" }}>
                      View
                    </button>
                    <button onClick={() => addToCart(p)} disabled={!canAddProductToCart(p)} className="btn btn-primary btn-sm" style={{ width: "100%" }}>
                      {getAddToCartLabel(p)}
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
