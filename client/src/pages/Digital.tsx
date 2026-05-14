import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { toast } from "sonner";
import { Download, Lock, Star } from "lucide-react";

const CATEGORIES = ["All", "Guide", "Workout", "Nutrition", "Mindset", "Wallpaper"];

// Static fallback products — always visible even without server
const STATIC_PRODUCTS = [
  {
    id: 1,
    name: "DISCIPLINE MINDSET — The BUILD LEVEL Guide",
    description: "A fully-loaded 13-page guide to building unbreakable mental strength. Covers 7 chapters: What Discipline Really Means, The Architecture of Your Mind, The Five Pillars of Mental Discipline, Daily Protocols, Handling Failure, Advanced Mental Training, and The BUILD LEVEL Code. This is not motivation. This is a system.",
    price: 19.99,
    category: "mindset",
    badge: "NEW",
    imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663635005932/ZpCxvttgRWUJYjQSvWcg6k/discipline-mindset-cover-4tL8ikv8VjQQa3vbGynnuC.webp",
    fileUrl: "/manus-storage/BUILD_LEVEL_Discipline_Mindset_4f45f459.pdf",
    fileName: "BUILD_LEVEL_Discipline_Mindset.pdf",
    published: true,
  },
];

export default function Digital() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [checkoutEmail, setCheckoutEmail] = useState<Record<number, string>>({});
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const { data: serverProducts, isLoading } = trpc.digital.list.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });
  // Use server products if available, otherwise fall back to static list
  const products = serverProducts && serverProducts.length > 0 ? serverProducts : (isLoading ? [] : STATIC_PRODUCTS);
  const createCheckout = trpc.digital.createCheckout.useMutation();

  const filtered = activeCategory === "All"
    ? products
    : products.filter(p => p.category === activeCategory.toLowerCase());

  const handleBuy = async (productId: number) => {
    const email = checkoutEmail[productId];
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setLoadingId(productId);
    try {
      const result = await createCheckout.mutateAsync({ productId, customerEmail: email });
      if (result.url) {
        toast.success("Redirecting to checkout...");
        window.open(result.url, "_blank");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-4 border-b border-white/10">
        <div className="max-w-6xl mx-auto">
          <p className="font-display text-[#FF6B00] text-xs tracking-[0.3em] mb-4">INSTANT DOWNLOAD</p>
          <h1 className="font-display text-5xl md:text-7xl font-black text-white tracking-tight leading-none mb-6">
            DIGITAL<br />
            <span className="text-[#FF6B00]">PRODUCTS</span>
          </h1>
          <p className="font-body text-[#888] text-lg max-w-xl">
            Workout plans, guides, and tools to help you build your level. Buy once, download instantly.
          </p>
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-8 px-4 border-b border-white/10 sticky top-0 bg-[#0A0A0A] z-10">
        <div className="max-w-6xl mx-auto flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 font-display text-xs tracking-widest px-4 py-2 border transition-all ${
                activeCategory === cat
                  ? "bg-[#FF6B00] text-black border-[#FF6B00]"
                  : "bg-transparent text-[#888] border-white/20 hover:border-[#FF6B00] hover:text-white"
              }`}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#1A1A1A] animate-pulse h-96" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <Download size={48} className="text-[#333] mx-auto mb-4" />
              <p className="font-display text-[#333] text-4xl font-black tracking-widest mb-4">COMING SOON</p>
              <p className="font-body text-[#555] text-sm">Digital products are being prepared. Check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((product) => (
                <div key={product.id} className="bg-[#111] border border-white/10 hover:border-[#FF6B00]/30 transition-all duration-300 overflow-hidden flex flex-col">
                  {/* Image */}
                  {product.imageUrl ? (
                    <div className="aspect-video overflow-hidden relative">
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      {product.badge && (
                        <span className="absolute top-3 left-3 bg-[#FF6B00] text-black font-display text-[10px] tracking-widest px-2 py-1">
                          {product.badge.toUpperCase()}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-video bg-[#1A1A1A] flex items-center justify-center relative">
                      <Download size={32} className="text-[#333]" />
                      {product.badge && (
                        <span className="absolute top-3 left-3 bg-[#FF6B00] text-black font-display text-[10px] tracking-widest px-2 py-1">
                          {product.badge.toUpperCase()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Info */}
                  <div className="p-5 flex flex-col flex-1">
                    <span className="font-display text-[#FF6B00] text-[10px] tracking-widest uppercase">{product.category}</span>
                    <h2 className="font-display text-white font-bold text-lg tracking-wide mt-1 mb-2">{product.name}</h2>
                    {product.description && (
                      <p className="font-body text-[#666] text-sm mb-4 flex-1 line-clamp-3">{product.description}</p>
                    )}

                    {/* Price + Download badge */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-display text-white font-bold text-2xl">
                        ${product.price.toFixed(2)}
                      </span>
                      <div className="flex items-center gap-1 text-[#555]">
                        <Download size={12} />
                        <span className="font-body text-xs">Instant download</span>
                      </div>
                    </div>

                    {/* Email + Buy */}
                    <div className="flex flex-col gap-2">
                      <input
                        type="email"
                        placeholder="Your email for download link"
                        value={checkoutEmail[product.id] || ""}
                        onChange={e => setCheckoutEmail(prev => ({ ...prev, [product.id]: e.target.value }))}
                        className="w-full bg-[#1A1A1A] border border-white/10 text-white font-body text-xs px-3 py-2.5 outline-none focus:border-[#FF6B00] transition-colors placeholder:text-[#444]"
                      />
                      <button
                        onClick={() => handleBuy(product.id)}
                        disabled={loadingId === product.id}
                        className="w-full bg-[#FF6B00] text-black font-display text-xs tracking-widest py-3 hover:bg-[#e55e00] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Lock size={12} />
                        {loadingId === product.id ? "REDIRECTING..." : "BUY NOW — INSTANT ACCESS"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Trust section */}
      <section className="py-12 px-4 border-t border-white/10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          {[
            { icon: <Lock size={20} />, title: "SECURE PAYMENT", desc: "Powered by Stripe. Your payment info is never stored." },
            { icon: <Download size={20} />, title: "INSTANT DOWNLOAD", desc: "Get your download link immediately after purchase." },
            { icon: <Star size={20} />, title: "QUALITY CONTENT", desc: "Built by people who live the BUILD LEVEL mindset." },
          ].map((item) => (
            <div key={item.title} className="flex flex-col items-center gap-3">
              <div className="text-[#FF6B00]">{item.icon}</div>
              <p className="font-display text-white text-xs tracking-widest font-bold">{item.title}</p>
              <p className="font-body text-[#555] text-xs">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
