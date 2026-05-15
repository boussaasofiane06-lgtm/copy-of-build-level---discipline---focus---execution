import { useState } from "react";

const PRODUCTS = [
  {
    id: 1,
    name: "DISCIPLINE MINDSET",
    subtitle: "Control Your Mind. Master Your Life.",
    description:
      "Most people have goals. Few have the discipline to reach them. This 5-chapter BUILD LEVEL system dismantles the excuses, rewires your daily habits, and builds the unbreakable mental foundation that separates those who talk from those who execute.",
    price: "$19.99",
    badge: "BESTSELLER",
    category: "PDF GUIDE",
    pages: "20 pages",
    chapters: "5 chapters",
    imageUrl: "/manus-storage/discipline_mindset_cover-01_e978ef9b.png",
    paymentLink: "https://buy.stripe.com/test_3cI5kD3gc5iOfz18lY6wE00",
    features: [
      "The Discipline Gap — why most people never close it",
      "The Identity Shift — become someone who doesn't quit",
      "The Daily Stack — your non-negotiable routine",
      "The Resistance Protocol — what to do when you don't want to",
      "The Long Game — sustaining discipline for years, not days",
    ],
  },
  {
    id: 2,
    name: "EXECUTION OVER EMOTION",
    subtitle: "Act First. Feel Later. Win Always.",
    description:
      "Stop letting how you feel determine what you accomplish. This 5-chapter BUILD LEVEL system teaches you to act first and feel later — building the identity, daily stack, and emotional intelligence of someone who executes no matter what.",
    price: "$19.99",
    badge: "NEW",
    category: "PDF GUIDE",
    pages: "15 pages",
    chapters: "5 chapters",
    imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663635005932/ZpCxvttgRWUJYjQSvWcg6k/execution_over_emotion_cover-XxPLoCsZtshDew6CWZtRnF.webp",
    paymentLink: "https://buy.stripe.com/test_9B68wPbMIcLg2Mf59M6wE01",
    features: [
      "The Emotion Trap — why feelings make terrible bosses",
      "The Execution Identity — who you are when feelings don't decide",
      "The Execution Stack — your daily operating system",
      "Emotional Intelligence as an Execution Tool",
      "The Long Game — sustaining execution when the world pushes back",
    ],
  },
];

function ProductCard({ product }: { product: (typeof PRODUCTS)[0] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-zinc-900 border border-zinc-800 overflow-hidden group hover:border-orange-500/50 transition-all duration-300">
      {/* Cover Image */}
      <div className="relative aspect-[3/4] overflow-hidden bg-zinc-800">
        <img
          src={product.imageUrl}
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
        <div className="absolute bottom-3 right-3 bg-black/80 text-orange-400 text-xs font-bold px-2 py-1 border border-orange-500/30 tracking-widest">
          {product.category}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="mb-4">
          <h2 className="text-white font-black text-xl tracking-wider leading-tight">
            {product.name}
          </h2>
          <p className="text-orange-400 text-sm font-semibold tracking-wide mt-1">
            {product.subtitle}
          </p>
        </div>

        <div className="flex gap-4 mb-4">
          <span className="text-zinc-500 text-xs">{product.pages}</span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500 text-xs">{product.chapters}</span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500 text-xs">Instant Download</span>
        </div>

        <p className="text-zinc-400 text-sm leading-relaxed mb-4">
          {product.description}
        </p>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-orange-400 text-xs font-bold tracking-widest uppercase mb-4 flex items-center gap-2 hover:text-orange-300 transition-colors"
        >
          <span>{expanded ? "▲" : "▼"}</span>
          WHAT'S INSIDE
        </button>

        {expanded && (
          <ul className="mb-4 space-y-2">
            {product.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-zinc-400 text-sm">
                <span className="text-orange-500 mt-0.5 shrink-0">▸</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-zinc-800 my-4" />

        <div className="flex items-center justify-between">
          <div>
            <span className="text-white font-black text-2xl">{product.price}</span>
            <span className="text-zinc-600 text-xs ml-2">USD</span>
          </div>
          <a
            href={product.paymentLink}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-orange-500 hover:bg-orange-400 text-black font-black text-sm px-6 py-3 tracking-widest uppercase transition-colors duration-200 inline-block"
          >
            BUY NOW →
          </a>
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
  const [filter, setFilter] = useState<"all" | "guide" | "audiobook">("all");

  const isSuccess =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("success") === "1";

  const filtered =
    filter === "all"
      ? PRODUCTS
      : filter === "guide"
      ? PRODUCTS.filter((p) => p.category === "PDF GUIDE")
      : PRODUCTS.filter((p) => p.category === "AUDIOBOOK");

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
            {(["all", "guide", "audiobook"] as const).map((f) => (
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
                  : "AUDIOBOOKS"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        {filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-zinc-600 text-lg">No products in this category yet.</p>
            <p className="text-zinc-700 text-sm mt-2">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((product) => (
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
