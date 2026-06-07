import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

type Product = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  imageUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  badge: string | null;
  stripePaymentLink?: string | null;
  published: boolean | null;
  scheduledAt?: string | null;
  sortOrder: number | null;
  createdAt: Date | null;
};

const isScheduledDigital = (product: Product) => {
  if (product.published || !product.scheduledAt) return false;
  const scheduled = new Date(product.scheduledAt);
  return !Number.isNaN(scheduled.getTime()) && scheduled > new Date();
};

const releaseCountdown = (scheduledAt?: string | null) => {
  if (!scheduledAt) return "";
  const scheduled = new Date(scheduledAt);
  if (Number.isNaN(scheduled.getTime())) return "";
  const diff = scheduled.getTime() - Date.now();
  if (diff <= 0) return "Available soon";
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
};

function ProductCard({ product }: { product: Product }) {
  const [expanded, setExpanded] = useState(false);

  const categoryLabel =
    product.category === "audiobook" || (product as any).productType === "audiobook"
      ? "AUDIOBOOK"
      : product.category === "video" || (product as any).productType === "video"
      ? "VIDEO COURSE"
      : product.category === "other" || (product as any).productType === "other"
      ? "OTHER"
      : "PDF GUIDE";

  const handleBuyNow = () => {
    if (isScheduledDigital(product)) {
      alert("This digital product is coming soon. Access opens when the countdown ends.");
      return;
    }
    const link = product.stripePaymentLink;
    if (link) {
      window.open(link, "_blank");
    } else {
      alert("Checkout link not available yet. Please check back soon.");
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 overflow-hidden group hover:border-orange-500/50 transition-all duration-300">
      {/* Cover Image */}
      <div className="relative aspect-[3/4] overflow-hidden bg-zinc-800">
        <img
          src={product.imageUrl || ""}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533' viewBox='0 0 400 533'%3E%3Crect width='400' height='533' fill='%2318181b'/%3E%3Ctext x='200' y='267' text-anchor='middle' fill='%23f97316' font-size='24' font-family='sans-serif'%3EBUILD LEVEL%3C/text%3E%3C/svg%3E";
          }}
        />
        {product.badge && (
          <div className="absolute top-3 left-3 bg-orange-500 text-black text-xs font-black px-2 py-1 tracking-widest">
            {product.badge}
          </div>
        )}
        {!isScheduledDigital(product) && (
          <div className="absolute top-3 right-3 border border-green-400 bg-green-500/20 text-green-300 text-xs font-black px-2 py-1 tracking-widest">
            PUBLISHED
          </div>
        )}
        <div className="absolute bottom-3 right-3 bg-black/80 text-orange-400 text-xs font-bold px-2 py-1 border border-orange-500/30 tracking-widest">
          {categoryLabel}
        </div>
        {isScheduledDigital(product) && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-center p-4">
            <div>
              <div className="inline-block border border-red-500 bg-red-500/20 text-red-200 text-xs font-black px-3 py-1 tracking-widest mb-3">SCHEDULED</div>
              <div className="text-white font-black text-xl tracking-widest">{releaseCountdown(product.scheduledAt)}</div>
              <div className="text-zinc-300 text-xs mt-2">{new Date(product.scheduledAt || "").toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="mb-4">
          <h2 className="text-white font-black text-xl tracking-wider leading-tight uppercase">
            {product.name}
          </h2>
        </div>

        <div className="flex gap-4 mb-4">
          <span className="text-zinc-500 text-xs">Instant Download</span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500 text-xs">Digital Product</span>
        </div>

        {!isScheduledDigital(product) && product.description && (
          <p className="text-zinc-400 text-sm leading-relaxed mb-4">
            {product.description}
          </p>
        )}
        {isScheduledDigital(product) && (
          <div className="border border-red-500/40 bg-red-500/10 p-3 mb-4 text-red-100 text-sm">
            Preview only. Access opens when this product is published after the countdown.
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-orange-400 text-xs font-bold tracking-widest uppercase mb-4 flex items-center gap-2 hover:text-orange-300 transition-colors"
        >
          <span>{expanded ? "▲" : "▼"}</span>
          DETAILS
        </button>

        {expanded && (
          <div className="mb-4 space-y-2 text-zinc-400 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-orange-500 mt-0.5 shrink-0">▸</span>
              <span>Category: {categoryLabel}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-orange-500 mt-0.5 shrink-0">▸</span>
              <span>Instant delivery after purchase</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-orange-500 mt-0.5 shrink-0">▸</span>
              <span>Lifetime access</span>
            </div>
          </div>
        )}

        <div className="border-t border-zinc-800 my-4" />

        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-white font-black text-2xl">
              ${product.price.toFixed(2)}
            </span>
            <span className="text-zinc-600 text-xs ml-2">USD</span>
          </div>
          <button
            onClick={handleBuyNow}
            disabled={isScheduledDigital(product)}
            className="bg-orange-500 hover:bg-orange-400 text-black font-black text-sm px-6 py-3 tracking-widest uppercase transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isScheduledDigital(product) ? "COMING SOON" : "BUY NOW →"}
          </button>
        </div>

        <div className="flex gap-3 mt-3 flex-wrap">
          <span className="text-zinc-600 text-xs">🔒 Secure checkout</span>
          <span className="text-zinc-600 text-xs">⚡ Instant delivery</span>
          <span className="text-zinc-600 text-xs">💳 All cards accepted</span>
        </div>
      </div>
    </div>
  );
}

export default function Digital() {
  const [filter, setFilter] = useState<"all" | "guide" | "audiobook" | "video" | "other">("all");

  const { data: products, isLoading, error } = trpc.digital.list.useQuery();

  const isSuccess =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("success") === "1";

  const filtered = (products || []).filter((p: any) => {
    if (filter === "all") return true;
    if (filter === "guide") return !p.category || p.category === "guide";
    if (filter === "audiobook") return p.category === "audiobook" || p.productType === "audiobook";
    if (filter === "video") return p.category === "video" || p.productType === "video";
    if (filter === "other") return p.category === "other" || p.productType === "other";
    return true;
  });

  return (
    <div className="min-h-screen bg-black text-white">
      {isSuccess && (
        <div className="bg-orange-500 text-black text-center py-3 px-4 font-bold text-sm">
          ✅ Purchase complete! Check your email for your download link.
        </div>
      )}

      {/* Hero */}
      <div className="border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="text-orange-500 text-xs font-black tracking-[0.3em] uppercase mb-4">
              BUILD LEVEL DIGITAL
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none mb-6 uppercase">
              KNOWLEDGE
              <br />
              <span className="text-orange-500">THAT HITS</span>
              <br />
              DIFFERENT
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed">
              No fluff. No filler. Just the systems, mindset frameworks, and
              execution blueprints that actually move the needle. Built for
              people who are done talking and ready to act.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="border-b border-zinc-800 sticky top-0 bg-black/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-0">
            {(["all", "guide", "audiobook", "video", "other"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-6 py-4 text-xs font-black tracking-widest uppercase border-b-2 transition-colors ${
                  filter === f
                    ? "border-orange-500 text-orange-500"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f === "all"
                  ? "ALL PRODUCTS"
                  : f === "guide"
                  ? "PDF GUIDES"
                  : f === "audiobook"
                  ? "AUDIOBOOKS"
                  : f === "video"
                  ? "VIDEO COURSES"
                  : "OTHER"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin text-orange-500" size={32} />
          </div>
        ) : error ? (
          <div className="text-center py-24">
            <p className="text-zinc-600 text-lg">Unable to load products.</p>
            <p className="text-zinc-700 text-sm mt-2">Please try again later.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-zinc-600 text-lg">No products in this category yet.</p>
            <p className="text-zinc-700 text-sm mt-2">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="border-t border-zinc-800 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <p className="text-zinc-600 text-sm tracking-widest uppercase mb-2">
            More dropping soon
          </p>
          <h3 className="text-white font-black text-2xl md:text-3xl uppercase">
            THE LIBRARY IS GROWING
          </h3>
          <p className="text-zinc-500 text-sm mt-3">
            New guides added regularly. Every one built to the same standard.
          </p>
        </div>
      </div>
    </div>
  );
}
