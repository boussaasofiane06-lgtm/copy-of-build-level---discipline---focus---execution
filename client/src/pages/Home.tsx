/* ==========================================================================
   BUILD LEVEL — Home Page
   Design: Dark Luxury Editorial — cinematic hero, editorial sections,
   Oswald display + DM Sans body, crimson red accents
   Sections: Hero, Ticker, Featured Collection, Brand Mission, Best Sellers,
             Lifestyle Banner, Motivational Quotes, Social Proof, Email Signup
   ========================================================================== */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Star, ChevronRight, ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart } from "@/contexts/CartContext";

const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663635005932/FqJozxCqZQ4nbgjqXYB8qi/hero_bg-85Hd3LDBKVBU2LrtwMCFr6.webp";
const MISSION_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663635005932/FqJozxCqZQ4nbgjqXYB8qi/mission_bg-i2sEsXdD6nFhU7BzWs9sQC.webp";
const PRODUCT_HOODIE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663635005932/FqJozxCqZQ4nbgjqXYB8qi/product_hoodie-mooq7Qw4za8hLYwwYeQdR6.webp";
const PRODUCT_TSHIRT = "https://d2xsxph8kpxj0f.cloudfront.net/310519663635005932/FqJozxCqZQ4nbgjqXYB8qi/product_tshirt-ZUmrE26ymPLdjN4UWhFo7C.webp";
const LIFESTYLE_BANNER = "https://d2xsxph8kpxj0f.cloudfront.net/310519663635005932/FqJozxCqZQ4nbgjqXYB8qi/lifestyle_banner-Buij7hEhHVXY6sLzydu3i4.webp";

const products = [
  {
    id: 1,
    name: "Build Level Core Hoodie",
    category: "Hoodies",
    priceUSD: 89,
    image: PRODUCT_HOODIE,
    tag: "BEST SELLER",
    tagColor: "#FF6B00",
    reviews: 4.9,
    reviewCount: 214,
  },
  {
    id: 2,
    name: "Execute Daily Tee",
    category: "T-Shirts",
    priceUSD: 45,
    image: PRODUCT_TSHIRT,
    tag: "NEW DROP",
    tagColor: "#FF6B00",
    reviews: 4.8,
    reviewCount: 98,
  },
  {
    id: 3,
    name: "Discipline Heavyweight Hoodie",
    category: "Hoodies",
    priceUSD: 95,
    image: PRODUCT_HOODIE,
    tag: "LIMITED",
    tagColor: "#FF6B00",
    reviews: 5.0,
    reviewCount: 67,
  },
  {
    id: 4,
    name: "Built Different Tee",
    category: "T-Shirts",
    priceUSD: 42,
    image: PRODUCT_TSHIRT,
    tag: null,
    tagColor: "",
    reviews: 4.7,
    reviewCount: 143,
  },
];

const reviews = [
  {
    name: "Marcus T.",
    rating: 5,
    text: "This brand hits different. The hoodie quality is insane and the message actually means something. Wear it to the gym every week.",
    location: "Atlanta, GA",
  },
  {
    name: "Jordan K.",
    rating: 5,
    text: "Finally a brand that matches my mindset. The Execute Daily tee is my go-to. Premium quality, no cap.",
    location: "Chicago, IL",
  },
  {
    name: "Devon R.",
    rating: 5,
    text: "Ordered twice already. The heavyweight hoodie is worth every dollar. BUILD LEVEL is the real deal.",
    location: "Houston, TX",
  },
];

const tickerItems = [
  "DISCIPLINE IS QUIET POWER",
  "EXECUTE DAILY",
  "BUILT DIFFERENT",
  "LOCK IN",
  "EARN YOUR RESULTS",
  "BUILD YOUR LEVEL",
  "STAY DISCIPLINED",
  "TALKING IS EASY. LIVING IT IS RARE.",
];

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
    );
    const elements = document.querySelectorAll(".scroll-reveal");
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

export default function Home() {
  const { addItem, openCart, convertPrice } = useCart();
  useScrollReveal();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState({ h: 11, m: 47, s: 32 });

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        let { h, m, s } = prev;
        s--;
        if (s < 0) { s = 59; m--; }
        if (m < 0) { m = 59; h--; }
        if (h < 0) { h = 23; m = 59; s = 59; }
        return { h, m, s };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="min-h-screen bg-[#2A2A2A]">
      <Navbar />

      {/* ===== HERO SECTION ===== */}
      <section
        className="relative min-h-screen flex items-end pb-20 overflow-hidden"
        style={{
          backgroundImage: `url(${HERO_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
        }}
      >
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#2A2A2A] via-transparent to-transparent" />

        {/* Limited drop banner */}
        <div className="absolute top-24 left-0 right-0 flex justify-center">
          <div className="flex items-center gap-3 bg-[#FF6B00] px-6 py-2">
            <span className="animate-pulse-red w-2 h-2 rounded-full bg-white inline-block" />
            <span className="font-display text-xs tracking-[0.3em] text-white">
              LIMITED DROP — ENDS IN {pad(countdown.h)}:{pad(countdown.m)}:{pad(countdown.s)}
            </span>
          </div>
        </div>

        <div className="relative z-10 max-w-[1280px] mx-auto px-6 lg:px-10 w-full">
          <div className="max-w-[700px]">
            <p className="section-label animate-fade-up">Discipline • Focus • Execution</p>
            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-[0.95] mb-6 animate-fade-up-delay-1">
              YOU DON'T<br />
              NEED TO<br />
              <span className="text-[#FF6B00]">TALK.</span><br />
              JUST PROVE IT.
            </h1>
            <p className="font-body text-[#B0B0A8] text-lg max-w-[480px] leading-relaxed mb-10 animate-fade-up-delay-2">
              BUILD LEVEL is more than clothing. It's a mindset built on discipline, focus, and execution.
            </p>
            <div className="flex flex-wrap gap-4 animate-fade-up-delay-3">
              <Link href="/shop">
                <span className="btn-primary text-sm tracking-[0.2em]">
                  SHOP NOW <ArrowRight size={14} className="ml-2 inline" />
                </span>
              </Link>
              <Link href="/about">
                <span className="btn-outline text-sm tracking-[0.2em]">
                  JOIN THE MOVEMENT
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TICKER BANNER ===== */}
      <div className="bg-[#FF6B00] py-3 overflow-hidden">
        <div className="flex animate-ticker whitespace-nowrap">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="font-display text-xs tracking-[0.3em] text-white mx-8">
              {item} <span className="mx-4 opacity-50">•</span>
            </span>
          ))}
        </div>
      </div>

      {/* ===== FEATURED COLLECTION ===== */}
      <section className="py-24 bg-[#2A2A2A]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="flex items-end justify-between mb-12 scroll-reveal">
            <div>
              <p className="section-label">01 — Collection</p>
              <h2 className="font-display text-4xl md:text-5xl font-bold text-white">
                FEATURED<br /><span className="text-[#FF6B00]">DROPS</span>
              </h2>
            </div>
            <Link href="/shop">
              <span className="hidden md:flex items-center gap-2 text-[#888] hover:text-white transition-colors font-display text-xs tracking-widest">
                VIEW ALL <ChevronRight size={14} />
              </span>
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {products.map((product, i) => (
              <div
                key={product.id}
                className={`product-card scroll-reveal`}
                style={{ transitionDelay: `${i * 0.1}s` }}
              >
                {product.tag && (
                  <div
                    className="absolute top-3 left-3 z-10 px-3 py-1"
                    style={{ backgroundColor: product.tagColor }}
                  >
                    <span className="font-display text-[10px] tracking-widest text-white">
                      {product.tag}
                    </span>
                  </div>
                )}
                <div className="aspect-[3/4] overflow-hidden">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                </div>
                <div className="product-overlay">
                  <Link href="/shop">
                    <span className="btn-primary text-xs px-6 py-3">QUICK VIEW</span>
                  </Link>
                </div>
                <div className="p-4">
                  <p className="font-display text-[10px] tracking-widest text-[#888] mb-1">
                    {product.category}
                  </p>
                  <h3 className="font-display text-sm font-semibold text-white mb-2">
                    {product.name}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-base font-bold text-[#FF6B00]">
                      {convertPrice(product.priceUSD)}
                    </span>
                    <div className="flex items-center gap-1">
                      <Star size={10} fill="#FF6B00" stroke="none" />
                      <span className="text-[#888] text-xs">{product.reviews}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center md:hidden">
            <Link href="/shop">
              <span className="btn-outline text-xs px-8 py-3">VIEW ALL PRODUCTS</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ===== BRAND MISSION SECTION ===== */}
      <section
        className="relative py-32 overflow-hidden"
        style={{
          backgroundImage: `url(${MISSION_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="absolute inset-0 bg-black/75" />
        <div className="relative z-10 max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="max-w-[600px] scroll-reveal">
            <p className="section-label">02 — Mission</p>
            <h2 className="font-display text-5xl md:text-6xl font-bold text-white leading-tight mb-8">
              BUILT<br /><span className="text-[#FF6B00]">DIFFERENT.</span>
            </h2>
            <div className="w-16 h-0.5 bg-[#FF6B00] mb-8" />
            <p className="font-body text-[#C0C0B8] text-lg leading-relaxed">
              BUILD LEVEL represents people who stay focused when nobody is watching. Discipline is quiet power. Execution separates dreamers from builders.
            </p>
            <div className="mt-12 grid grid-cols-3 gap-8">
              {[
                { label: "Discipline", value: "01" },
                { label: "Focus", value: "02" },
                { label: "Execution", value: "03" },
              ].map((item) => (
                <div key={item.value}>
                  <div className="font-display text-4xl font-bold text-[#FF6B00] mb-2">{item.value}</div>
                  <div className="font-display text-sm tracking-widest text-white">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== BEST SELLERS ===== */}
      <section className="py-24 bg-[#333333]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="text-center mb-16 scroll-reveal">
            <p className="section-label">03 — Best Sellers</p>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-white">
              MOST <span className="text-[#FF6B00]">WANTED</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {products.slice(0, 2).map((product, i) => (
              <div
                key={product.id}
                className="group flex gap-6 bg-[#404040] p-6 border border-white/5 hover:border-[#FF6B00]/30 transition-all duration-300 scroll-reveal"
                style={{ transitionDelay: `${i * 0.15}s` }}
              >
                <div className="w-32 h-40 flex-shrink-0 overflow-hidden">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="flex flex-col justify-between flex-1">
                  <div>
                    <p className="font-display text-[10px] tracking-widest text-[#888] mb-1">{product.category}</p>
                    <h3 className="font-display text-lg font-bold text-white mb-2">{product.name}</h3>
                    <div className="flex items-center gap-1 mb-3">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} size={12} fill="#FF6B00" stroke="none" />
                      ))}
                      <span className="text-[#888] text-xs ml-1">({product.reviewCount})</span>
                    </div>
                    <div className="flex gap-2 mb-4">
                      {["S", "M", "L", "XL", "XXL"].map((size) => (
                        <button
                          key={size}
                          className="w-8 h-8 border border-white/20 font-display text-[10px] text-[#888] hover:border-[#FF6B00] hover:text-white transition-all"
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xl font-bold text-[#FF6B00]">{convertPrice(product.priceUSD)}</span>
                    <button onClick={() => addItem({ id: product.id, name: product.name, category: product.category, priceUSD: product.priceUSD, image: product.image, size: 'M' })} className="btn-primary text-xs px-5 py-2.5">ADD TO CART</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== LIFESTYLE BANNER ===== */}
      <section
        className="relative py-40 overflow-hidden"
        style={{
          backgroundImage: `url(${LIFESTYLE_BANNER})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative z-10 text-center max-w-[800px] mx-auto px-6 scroll-reveal">
          <h2 className="font-display text-5xl md:text-7xl font-bold text-white leading-tight">
            SMALL STEPS.<br /><span className="text-[#FF6B00]">BIG WINS.</span>
          </h2>
          <div className="w-24 h-0.5 bg-[#FF6B00] mx-auto my-8" />
          <p className="font-body text-[#C0C0B8] text-lg">
            Discipline Is Quiet Power. Talking Is Easy. Living It Is Rare.
          </p>
        </div>
      </section>

      {/* ===== MOTIVATIONAL QUOTES TICKER ===== */}
      <section className="py-20 bg-[#2A2A2A]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/5">
            {[
              { quote: "Discipline Is Quiet Power.", sub: "The foundation of everything." },
              { quote: "Talking Is Easy. Living It Is Rare.", sub: "Actions define you." },
              { quote: "Earn Your Results.", sub: "No shortcuts. No excuses." },
            ].map((item, i) => (
              <div
                key={i}
                className="bg-[#2A2A2A] p-10 text-center scroll-reveal"
                style={{ transitionDelay: `${i * 0.15}s` }}
              >
                <div className="w-8 h-0.5 bg-[#FF6B00] mx-auto mb-6" />
                <h3 className="font-display text-xl md:text-2xl font-bold text-white mb-3">
                  {item.quote}
                </h3>
                <p className="font-body text-[#888] text-sm">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF / REVIEWS ===== */}
      <section className="py-24 bg-[#333333]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="text-center mb-16 scroll-reveal">
            <p className="section-label">04 — Community</p>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-white">
              THE <span className="text-[#FF6B00]">MOVEMENT</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {reviews.map((review, i) => (
              <div
                key={i}
                className="bg-[#404040] p-8 border border-white/5 scroll-reveal"
                style={{ transitionDelay: `${i * 0.15}s` }}
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: review.rating }).map((_, j) => (
                    <Star key={j} size={14} fill="#FF6B00" stroke="none" />
                  ))}
                </div>
                <p className="font-body text-[#C0C0B8] text-sm leading-relaxed mb-6 italic">
                  "{review.text}"
                </p>
                <div>
                  <p className="font-display text-sm font-semibold text-white">{review.name}</p>
                  <p className="font-body text-[#888] text-xs mt-1">{review.location}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Social Media CTA */}
          <div className="text-center scroll-reveal">
            <p className="font-body text-[#888] text-sm mb-6">
              Follow us for daily motivation, drops, and community content
            </p>
            <div className="flex justify-center gap-4">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline text-xs px-6 py-3"
              >
                INSTAGRAM
              </a>
              <a
                href="https://tiktok.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-xs px-6 py-3"
              >
                TIKTOK
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== EMAIL SIGNUP ===== */}
      <section className="py-24 bg-[#FF6B00]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 text-center scroll-reveal">
          <p className="font-display text-xs tracking-[0.3em] text-white/70 mb-4">05 — Community</p>
          <h2 className="font-display text-4xl md:text-6xl font-bold text-white mb-4">
            JOIN BUILD LEVEL
          </h2>
          <p className="font-body text-white/80 text-lg mb-10 max-w-[400px] mx-auto">
            Get exclusive drops, motivation, and early access.
          </p>
          {submitted ? (
            <div className="font-display text-xl tracking-widest text-white">
              YOU'RE IN. STAY DISCIPLINED.
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="flex flex-col sm:flex-row gap-0 max-w-[480px] mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="YOUR EMAIL ADDRESS"
                required
                className="flex-1 bg-white/10 border border-white/30 text-white placeholder-white/50 px-6 py-4 font-display text-xs tracking-widest outline-none focus:border-white transition-colors"
              />
              <button
                type="submit"
                className="bg-[#2A2A2A] text-white px-8 py-4 font-display text-xs tracking-[0.2em] hover:bg-[#1A1A1A] transition-colors whitespace-nowrap"
              >
                LOCK IN
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ===== PARTNERS & INTEGRATIONS ===== */}
      <section className="py-16 bg-[#1A1A1A] border-t border-white/5">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div>
              <p className="section-label">Powered By</p>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-white">
                BUILT TO <span className="text-[#FF6B00]">SCALE.</span>
              </h2>
              <p className="font-body text-[#888] text-sm mt-2 max-w-[360px]">
                This store runs on a fully automated stack — payments, fulfillment, and customer support all handled for you.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              {[
                { name: "Shopify", desc: "Checkout", url: "https://shopify.com" },
                { name: "Printify", desc: "Fulfillment", url: "https://printify.com" },
                { name: "Tidio", desc: "AI Support", url: "https://tidio.com" },
                { name: "Stripe", desc: "Payments", url: "https://stripe.com" },
              ].map((partner) => (
                <a
                  key={partner.name}
                  href={partner.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center bg-[#2A2A2A] border border-white/10 hover:border-[#FF6B00]/40 px-6 py-4 transition-all duration-200 group"
                >
                  <span className="font-display text-sm font-bold text-white group-hover:text-[#FF6B00] transition-colors">{partner.name}</span>
                  <span className="font-body text-[10px] text-[#555] mt-1">{partner.desc}</span>
                </a>
              ))}
            </div>
            <Link href="/integrations">
              <span className="btn-outline text-xs px-6 py-3 whitespace-nowrap">SETUP GUIDE</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
