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

export default function Shop() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedSizes, setSelectedSizes] = useState<Record<number, string>>({});
  const { addItem, convertPrice, openCart } = useCart();

  const { data: dbProducts, isLoading: productsLoading } = trpc.products.list.useQuery({});

  // Only show published, non-hidden, non-delisted products from the database
  const allProducts = (dbProducts || []).filter((p: any) =>
    p.published !== false && p.hidden !== true && p.delisted !== true
  );

  // Pre-select first size for each product on load
  useEffect(() => {
    const defaults: Record<number, string> = {};
    allProducts.forEach((p: any) => {
      const sizes = (p.sizes as string[]) || SIZES;
      if (sizes.length > 0) defaults[p.id] = sizes[0];
    });
    setSelectedSizes(defaults);
  }, [allProducts.length]);

  const filtered = activeCategory === "All"
    ? allProducts
    : allProducts.filter((p: any) => p.category.toLowerCase() === activeCategory.toLowerCase());

  const handleSizeSelect = (productId: number, size: string) => {
    setSelectedSizes((prev) => ({ ...prev, [productId]: size }));
  };

  const handleAddToCart = (product: typeof allProducts[0]) => {
    const productSizes = (product.sizes as string[]) || SIZES;
    const size = selectedSizes[product.id] || productSizes[0] || "M";
    addItem({
      id: product.id,
      name: product.name,
      category: product.category,
      priceUSD: product.price,
      image: product.imageUrl || "",
      size,
    });
    toast.success(`${product.name} (${size}) added to cart`, {
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
            {filtered.map((product: any, i: number) => (
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
                    className="btn-primary text-xs px-6 py-3 flex items-center gap-2"
                  >
                    <ShoppingBag size={12} />
                    ADD TO CART
                  </button>
                </div>
                <div className="p-4">
                  <p className="font-display text-[10px] tracking-widest text-[#888] mb-1">
                    {product.category}
                  </p>
                  <h3 className="font-display text-sm font-semibold text-white mb-2">
                    {product.name}
                  </h3>
                  {/* Size selector */}
                  <div className="flex gap-1 mb-3 flex-wrap">
                    {((product.sizes as string[]) || SIZES).map((size) => {
                      const isSelected = selectedSizes[product.id] === size;
                      return (
                        <button
                          key={size}
                          onClick={(e) => { e.stopPropagation(); handleSizeSelect(product.id, size); }}
                          style={isSelected ? { boxShadow: "0 0 8px rgba(255,107,0,0.7)" } : {}}
                          className={`relative min-w-[30px] h-8 px-2 font-display text-[10px] font-bold transition-all duration-150 touch-manipulation border-2 ${
                            isSelected
                              ? "border-[#FF6B00] bg-[#FF6B00] text-white scale-110 z-10"
                              : "border-white/20 text-[#666] hover:border-[#FF6B00] hover:text-white bg-transparent"
                          }`}
                        >
                          {size}
                          {isSelected && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF6B00] border border-[#2A2A2A]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-base font-bold text-[#FF6B00]">
                      {convertPrice(product.price)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Star size={10} fill="#FF6B00" stroke="none" />
                      <span className="text-[#888] text-xs">4.9</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
