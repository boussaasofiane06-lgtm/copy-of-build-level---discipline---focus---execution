/* ==========================================================================
   BUILD LEVEL — Shop Page
   Design: Dark Luxury Editorial — product grid with category filters,
   size selection, add to cart with CartContext integration
   ========================================================================== */

import { useState, useEffect } from "react";
import { Star, Filter, ShoppingBag, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/contexts/CartContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const PRODUCT_HOODIE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663635005932/FqJozxCqZQ4nbgjqXYB8qi/product_hoodie-mooq7Qw4za8hLYwwYeQdR6.webp";
const PRODUCT_TSHIRT = "https://d2xsxph8kpxj0f.cloudfront.net/310519663635005932/FqJozxCqZQ4nbgjqXYB8qi/product_tshirt-ZUmrE26ymPLdjN4UWhFo7C.webp";

// No fallback products — all products are managed via the admin panel

const categories = ["All", "Hoodies", "T-Shirts", "Hats", "Accessories"];
const SIZES = ["S", "M", "L", "XL", "XXL"];

type VariantDimension = "size" | "color";
type VariantSelection = Partial<Record<VariantDimension, string>>;
type ProductOption = {
  value: string;
  label: string;
  price?: number;
  variantId?: string;
  size?: string;
  color?: string;
};

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

const parseEmbeddedPrice = (label: string) => {
  const match = label.match(priceSuffixPattern);
  return match?.[1] ? Number.parseFloat(match[1]) : NaN;
};

const isLikelySize = (value: string) => sizePattern.test(value.trim().toUpperCase().replace(/\s+/g, ""));

const deriveOptionAttributes = (rawLabel: string) => {
  const label = rawLabel.replace(/^"+|"+$/g, "").replace(priceSuffixPattern, "").trim();
  const parts = label.split(/\s*\/\s*/).map(part => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    const size = parts.find(isLikelySize);
    if (size) {
      const colors = parts.filter(part => part !== size);
      return { label, size, color: colors.join(" / ") || undefined };
    }
    return { label, color: parts[0], size: parts.slice(1).join(" / ") };
  }

  if (isLikelySize(label)) return { label, size: label };
  return { label, color: /^default$/i.test(label) ? undefined : label };
};

const parseProductOption = (value: string, fallbackPrice: number): ProductOption | null => {
  const trimmed = String(value || "").trim();
  if (!trimmed || /^"?variantId"?\s*:/i.test(trimmed) || /^"?price"?\s*:/i.test(trimmed)) return null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawLabel = String(parsed?.label || value);
      const attrs = deriveOptionAttributes(rawLabel);
      const parsedPrice = Number.parseFloat(String(parsed?.price || "")) || parseEmbeddedPrice(rawLabel);
      return {
        value,
        label: attrs.label,
        price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : fallbackPrice,
        variantId: parsed?.variantId ? String(parsed.variantId) : undefined,
        size: attrs.size,
        color: attrs.color,
      };
    } catch {
      const labelMatch = trimmed.match(/"label"\s*:\s*"([^"]+)/i);
      if (!labelMatch?.[1]) return null;
      const attrs = deriveOptionAttributes(labelMatch[1]);
      return { value, label: attrs.label, price: fallbackPrice, size: attrs.size, color: attrs.color };
    }
  }

  const attrs = deriveOptionAttributes(trimmed);
  const embeddedPrice = parseEmbeddedPrice(trimmed);
  return {
    value,
    label: attrs.label,
    price: Number.isFinite(embeddedPrice) && embeddedPrice > 0 ? embeddedPrice : fallbackPrice,
    size: attrs.size,
    color: attrs.color,
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

const getProductOptions = (product: any) => {
  const fallbackPrice = Number.parseFloat(String(product.price || "0")) || 0;
  return repairOptionValues(Array.isArray(product.sizes) && product.sizes.length ? product.sizes : SIZES)
    .map(option => parseProductOption(option, fallbackPrice))
    .filter((option): option is ProductOption => !!option && !!option.label);
};

const getVariantChoices = (product: any) => {
  const options = getProductOptions(product);
  return {
    options,
    sizes: uniqueValues(options.map(option => option.size)),
    colors: uniqueValues(options.map(option => option.color)),
  };
};

const getEffectiveSelection = (product: any, selections: Record<number, VariantSelection>) => {
  const choices = getVariantChoices(product);
  const selection = selections[product.id] || {};
  return {
    size: choices.sizes.length === 1 ? choices.sizes[0] : selection.size,
    color: choices.colors.length === 1 ? choices.colors[0] : selection.color,
  };
};

const getSelectedOption = (product: any, selections: Record<number, VariantSelection>) => {
  const choices = getVariantChoices(product);
  const selected = getEffectiveSelection(product, selections);
  if (choices.sizes.length > 0 && !selected.size) return null;
  if (choices.colors.length > 0 && !selected.color) return null;
  return choices.options.find(option =>
    (!choices.sizes.length || option.size === selected.size) &&
    (!choices.colors.length || option.color === selected.color)
  ) || (choices.sizes.length || choices.colors.length ? null : choices.options[0] || null);
};

export default function Shop() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [variantSelections, setVariantSelections] = useState<Record<number, VariantSelection>>({});
  const { addItem, convertPrice, openCart } = useCart();

  const { data: dbProducts, isLoading: productsLoading } = trpc.products.list.useQuery({});

  // Only show published, non-hidden, non-delisted products from the database
  const allProducts = (dbProducts || []).filter((p: any) =>
    p.published !== false && p.hidden !== true && p.delisted !== true
  );

  const filtered = activeCategory === "All"
    ? allProducts
    : allProducts.filter((p: any) => p.category.toLowerCase() === activeCategory.toLowerCase());

  const isChoiceAvailable = (product: any, dimension: VariantDimension, value: string) => {
    const choices = getVariantChoices(product);
    const selected = getEffectiveSelection(product, variantSelections);
    return choices.options.some(option => {
      if (dimension === "size") return option.size === value && (!choices.colors.length || !selected.color || option.color === selected.color);
      return option.color === value && (!choices.sizes.length || !selected.size || option.size === selected.size);
    });
  };

  const handleVariantSelect = (product: any, dimension: VariantDimension, value: string) => {
    setVariantSelections((prev) => {
      const next: VariantSelection = { ...(prev[product.id] || {}), [dimension]: value };
      const choices = getVariantChoices(product);
      if (dimension === "size" && next.color && !choices.options.some(option => option.size === value && option.color === next.color)) delete next.color;
      if (dimension === "color" && next.size && !choices.options.some(option => option.color === value && option.size === next.size)) delete next.size;
      return { ...prev, [product.id]: next };
    });
  };

  const renderSelector = (product: any, dimension: VariantDimension, label: string, values: string[]) => {
    const selected = getEffectiveSelection(product, variantSelections)[dimension];
    if (!values.length) return null;
    return (
      <div className="mb-3">
        <p className="font-display text-[9px] tracking-[0.18em] text-[#777] uppercase mb-1">{label}</p>
        <div className="flex gap-1 flex-wrap">
          {values.map((value) => {
            const isSelected = selected === value;
            const disabled = !isChoiceAvailable(product, dimension, value);
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); handleVariantSelect(product, dimension, value); }}
                style={isSelected ? { boxShadow: "0 0 8px rgba(255,107,0,0.7)" } : {}}
                className={`relative min-w-[30px] h-8 px-2 font-display text-[10px] font-bold transition-all duration-150 touch-manipulation border-2 ${
                  isSelected
                    ? "border-[#FF6B00] bg-[#FF6B00] text-white scale-105 z-10"
                    : disabled
                      ? "border-white/10 text-[#444] bg-transparent opacity-40 cursor-not-allowed"
                      : "border-white/20 text-[#666] hover:border-[#FF6B00] hover:text-white bg-transparent"
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const handleAddToCart = (product: typeof allProducts[0]) => {
    const selectedOption = getSelectedOption(product, variantSelections);
    if (getProductOptions(product).length > 0 && !selectedOption) {
      toast.error("Select size and color first");
      return;
    }
    addItem({
      id: product.id,
      name: product.name,
      category: product.category,
      priceUSD: selectedOption?.price || product.price,
      image: product.imageUrl || "",
      size: selectedOption?.label || "",
    });
    toast.success(`${product.name}${selectedOption?.label ? ` (${selectedOption.label})` : ""} added to cart`, {
      description: "View your cart to checkout",
      action: { label: "View Cart", onClick: openCart },
    });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".scroll-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [filtered]);

  return (
    <div className="min-h-screen bg-[#2A2A2A]">
      <Navbar />

      {/* Page Header */}
      <div className="pt-32 pb-16 bg-[#333333] border-b border-white/5">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <p className="section-label">Build Level</p>
          <h1 className="font-display text-5xl md:text-6xl font-bold text-white">
            THE <span className="text-[#FF6B00]">SHOP</span>
          </h1>
          <p className="font-body text-[#888] mt-4 text-sm">
            Premium gear for those who execute daily.
          </p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="sticky top-16 z-30 bg-[#2A2A2A]/95 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-4 flex items-center gap-6 overflow-x-auto">
          <Filter size={14} className="text-[#888] flex-shrink-0" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`font-display text-xs tracking-[0.2em] whitespace-nowrap transition-colors pb-1 ${
                activeCategory === cat
                  ? "text-[#FF6B00] border-b-2 border-[#FF6B00]"
                  : "text-[#888] hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      <section className="py-16">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          {productsLoading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={32} className="text-[#FF6B00] animate-spin" />
            </div>
          )}
          {!productsLoading && allProducts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <ShoppingBag size={48} className="text-[#333] mb-4" />
              <p className="font-display text-[#555] text-lg tracking-widest mb-2">NEW DROPS COMING SOON</p>
              <p className="font-body text-[#444] text-sm">Check back soon for the latest gear.</p>
            </div>
          )}
          {!productsLoading && allProducts.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((product: any, i: number) => {
              const choices = getVariantChoices(product);
              const selectedOption = getSelectedOption(product, variantSelections);
              const needsSelection = choices.options.length > 0 && !selectedOption;
              return (
                <div
                  key={product.id}
                  className="product-card scroll-reveal"
                  style={{ transitionDelay: `${i * 0.05}s` }}
                >
                {product.badge && (
                  <div className="absolute top-3 left-3 z-10 px-3 py-1 bg-[#FF6B00]">
                    <span className="font-display text-[10px] tracking-widest text-white">
                      {product.badge}
                    </span>
                  </div>
                )}
                <div className="aspect-[3/4] overflow-hidden">
                  <img
                    src={product.imageUrl || ""}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                </div>
                <div className="product-overlay">
                  <button
                    onClick={() => handleAddToCart(product)}
                    disabled={needsSelection}
                    className="btn-primary text-xs px-6 py-3 flex items-center gap-2"
                  >
                    <ShoppingBag size={12} />
                    {needsSelection ? "SELECT OPTIONS" : "ADD TO CART"}
                  </button>
                </div>
                <div className="p-4">
                  <p className="font-display text-[10px] tracking-widest text-[#888] mb-1">
                    {product.category}
                  </p>
                  <h3 className="font-display text-sm font-semibold text-white mb-2">
                    {product.name}
                  </h3>
                  {renderSelector(product, "size", "Select Size", choices.sizes)}
                  {renderSelector(product, "color", "Select Color", choices.colors)}
                  <div className="flex items-center justify-between">
                    <span className={`font-display font-bold ${needsSelection ? "text-xs text-[#888]" : "text-base text-[#FF6B00]"}`}>
                      {needsSelection ? "Select options for price" : convertPrice(selectedOption?.price || product.price)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Star size={10} fill="#FF6B00" stroke="none" />
                      <span className="text-[#888] text-xs">4.9</span>
                    </div>
                  </div>
                </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
