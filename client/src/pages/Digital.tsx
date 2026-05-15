import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { toast } from "sonner";
import { Download, Lock, Star, Headphones, BookOpen, Play, Pause, Volume2, Globe, Loader2, CheckCircle, ChevronDown } from "lucide-react";

const CATEGORIES = ["All", "Guide", "Audiobook", "Workout", "Nutrition", "Mindset"];

// Static fallback products — always visible even without server
const STATIC_PRODUCTS = [
  {
    id: 1,
    name: "DISCIPLINE MINDSET: Control Your Mind. Master Your Life.",
    description: "A fully-loaded guide to building unbreakable mental strength. Covers 5 chapters: Discipline as Identity, Build Your Focus Engine, The Five Pillars of Mental Discipline, Daily Protocols That Execute, and Failure Without Identity Collapse. This is not motivation. This is a system.",
    price: 19.99,
    category: "mindset",
    productType: "pdf" as const,
    badge: "NEW",
    imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663635005932/ZpCxvttgRWUJYjQSvWcg6k/discipline-mindset-cover-4tL8ikv8VjQQa3vbGynnuC.webp",
    fileUrl: "/manus-storage/BUILD_LEVEL_Discipline_Mindset_4f45f459.pdf",
    fileName: "BUILD_LEVEL_Discipline_Mindset.pdf",
    audioUrl: null as string | null,
    duration: null as string | null,
    published: true,
  },
];

// Audio Player component
function AudioPlayer({ audioUrl, title }: { audioUrl: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.ontimeupdate = () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };
    audio.onended = () => { setPlaying(false); setProgress(0); };
    return () => { audio.pause(); audio.src = ""; };
  }, [audioUrl]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => toast.error("Could not play audio. Try downloading instead."));
      setPlaying(true);
    }
  };

  return (
    <div className="bg-[#1A1A1A] border border-[#FF6B00]/30 p-4 mt-3">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={toggle}
          className="w-9 h-9 bg-[#FF6B00] flex items-center justify-center flex-shrink-0 hover:bg-[#e55e00] transition-colors"
        >
          {playing ? <Pause size={14} className="text-black" /> : <Play size={14} className="text-black" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-display text-white text-[11px] tracking-wide truncate">{title}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <Volume2 size={9} className="text-[#FF6B00]" />
            <span className="font-body text-[#555] text-[10px]">Audio narration</span>
          </div>
        </div>
      </div>
      {/* Progress bar */}
      <div className="w-full bg-[#333] h-0.5">
        <div className="bg-[#FF6B00] h-0.5 transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

// Language Selector + Translation Panel
function TranslationPanel({ productId, productName }: { productId: number; productName: string }) {
  const [open, setOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState<{ code: string; name: string; nativeName: string } | null>(null);
  const [translationId, setTranslationId] = useState<number | null>(null);
  const [pollingStatus, setPollingStatus] = useState<string | null>(null);

  const { data: languages } = trpc.translation.getSupportedLanguages.useQuery();
  const { data: existingTranslation, refetch: refetchTranslation } = trpc.translation.getTranslation.useQuery(
    { productId, language: selectedLang?.code || "" },
    { enabled: !!selectedLang, staleTime: 5_000 }
  );

  const requestMutation = trpc.translation.requestTranslation.useMutation();
  const processMutation = trpc.translation.processTranslation.useMutation();

  // Poll for status when processing
  useEffect(() => {
    if (!translationId || pollingStatus === "ready" || pollingStatus === "error") return;
    const interval = setInterval(async () => {
      await refetchTranslation();
      if (existingTranslation?.status === "ready" || existingTranslation?.status === "error") {
        setPollingStatus(existingTranslation.status);
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [translationId, pollingStatus, existingTranslation, refetchTranslation]);

  const handleLanguageSelect = async (lang: { code: string; name: string; nativeName: string }) => {
    setSelectedLang(lang);
    setOpen(false);
    setPollingStatus(null);
    setTranslationId(null);

    // Check if already exists
    await refetchTranslation();
  };

  const handleGenerate = async () => {
    if (!selectedLang) return;
    try {
      const result = await requestMutation.mutateAsync({ productId, language: selectedLang.code });
      setTranslationId(result.id);
      setPollingStatus(result.status);

      if (result.status === "pending") {
        toast.info(`Generating ${selectedLang.name} translation + audio. This takes 1-2 minutes...`);
        // Kick off processing
        processMutation.mutate({ translationId: result.id });
        setPollingStatus("translating");
      } else if (result.status === "ready") {
        setPollingStatus("ready");
        toast.success(`${selectedLang.name} version ready!`);
      }
    } catch {
      toast.error("Failed to start translation. Please try again.");
    }
  };

  const isProcessing = pollingStatus === "translating" || pollingStatus === "generating_audio" || pollingStatus === "pending";
  const isReady = existingTranslation?.status === "ready" || pollingStatus === "ready";

  const statusLabel: Record<string, string> = {
    pending: "Starting...",
    translating: "Translating content...",
    generating_audio: "Generating voice audio...",
    ready: "Ready",
    error: "Error — try again",
  };

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={13} className="text-[#FF6B00]" />
        <span className="font-display text-[#FF6B00] text-[10px] tracking-widest">AVAILABLE IN 12 LANGUAGES</span>
      </div>

      {/* Language dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="w-full bg-[#1A1A1A] border border-white/10 text-white font-body text-xs px-3 py-2.5 flex items-center justify-between hover:border-[#FF6B00]/50 transition-colors"
        >
          <span className={selectedLang ? "text-white" : "text-[#444]"}>
            {selectedLang ? `${selectedLang.nativeName} (${selectedLang.name})` : "Choose your language..."}
          </span>
          <ChevronDown size={12} className={`text-[#555] transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && languages && (
          <div className="absolute top-full left-0 right-0 bg-[#1A1A1A] border border-white/10 z-20 max-h-48 overflow-y-auto">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageSelect(lang)}
                className="w-full text-left px-3 py-2 font-body text-xs text-[#888] hover:bg-[#FF6B00]/10 hover:text-white transition-colors flex items-center justify-between"
              >
                <span>{lang.nativeName}</span>
                <span className="text-[#444]">{lang.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status / Action */}
      {selectedLang && (
        <div className="mt-3">
          {isReady && existingTranslation ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle size={12} className="text-green-400" />
                <span className="font-body text-green-400 text-xs">{selectedLang.name} version ready</span>
              </div>
              {existingTranslation.audioUrl && (
                <AudioPlayer audioUrl={existingTranslation.audioUrl} title={`${productName} — ${selectedLang.name}`} />
              )}
              {existingTranslation.audioDuration && (
                <div className="flex items-center gap-1">
                  <Headphones size={10} className="text-[#555]" />
                  <span className="font-body text-[#555] text-[10px]">{existingTranslation.audioDuration} audio narration</span>
                </div>
              )}
              <p className="font-body text-[#555] text-[10px]">
                Purchase above to receive the {selectedLang.name} PDF + audio in your email.
              </p>
            </div>
          ) : isProcessing ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 size={12} className="text-[#FF6B00] animate-spin" />
              <span className="font-body text-[#888] text-xs">
                {statusLabel[pollingStatus || "pending"]}
              </span>
            </div>
          ) : existingTranslation?.status === "error" ? (
            <div className="space-y-2">
              <p className="font-body text-red-400 text-xs">Translation failed. Please try again.</p>
              <button
                onClick={handleGenerate}
                className="w-full bg-[#1A1A1A] border border-[#FF6B00]/50 text-[#FF6B00] font-display text-[10px] tracking-widest py-2 hover:bg-[#FF6B00]/10 transition-colors"
              >
                RETRY
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={requestMutation.isPending}
              className="w-full bg-[#1A1A1A] border border-[#FF6B00]/50 text-[#FF6B00] font-display text-[10px] tracking-widest py-2.5 hover:bg-[#FF6B00]/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Globe size={11} />
              {requestMutation.isPending ? "STARTING..." : `GENERATE ${selectedLang.name.toUpperCase()} VERSION + AUDIO`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
    : products.filter(p =>
        activeCategory === "Audiobook"
          ? (p as any).productType === "audiobook"
          : p.category === activeCategory.toLowerCase()
      );

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
            Guides, audiobooks, and tools to help you build your level. Buy once, access instantly — in your language.
          </p>
          {/* Type icons */}
          <div className="flex flex-wrap gap-6 mt-8">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-[#FF6B00]" />
              <span className="font-display text-[#888] text-xs tracking-widest">PDF GUIDES</span>
            </div>
            <div className="flex items-center gap-2">
              <Headphones size={16} className="text-[#FF6B00]" />
              <span className="font-display text-[#888] text-xs tracking-widest">AUDIOBOOKS</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-[#FF6B00]" />
              <span className="font-display text-[#888] text-xs tracking-widest">12 LANGUAGES</span>
            </div>
          </div>
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
              {filtered.map((product) => {
                const isAudiobook = (product as any).productType === "audiobook";
                const audioUrl = (product as any).audioUrl as string | null;
                const duration = (product as any).duration as string | null;
                return (
                  <div key={product.id} className="bg-[#111] border border-white/10 hover:border-[#FF6B00]/30 transition-all duration-300 overflow-hidden flex flex-col">
                    {/* Image */}
                    {product.imageUrl ? (
                      <div className="aspect-video overflow-hidden relative">
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                        {/* Type badge */}
                        <div className="absolute top-3 right-3 bg-black/70 flex items-center gap-1 px-2 py-1">
                          {isAudiobook
                            ? <><Headphones size={10} className="text-[#FF6B00]" /><span className="font-display text-[#FF6B00] text-[9px] tracking-widest">AUDIO</span></>
                            : <><BookOpen size={10} className="text-[#FF6B00]" /><span className="font-display text-[#FF6B00] text-[9px] tracking-widest">PDF</span></>
                          }
                        </div>
                        {product.badge && (
                          <span className="absolute top-3 left-3 bg-[#FF6B00] text-black font-display text-[10px] tracking-widest px-2 py-1">
                            {product.badge.toUpperCase()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-video bg-[#1A1A1A] flex items-center justify-center relative">
                        {isAudiobook ? <Headphones size={32} className="text-[#333]" /> : <Download size={32} className="text-[#333]" />}
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
                        <p className="font-body text-[#666] text-sm mb-3 flex-1 line-clamp-3">{product.description}</p>
                      )}

                      {/* Audio preview player for audiobooks */}
                      {isAudiobook && audioUrl && (
                        <AudioPlayer audioUrl={audioUrl} title={product.name} />
                      )}

                      {/* Duration for audiobooks */}
                      {isAudiobook && duration && (
                        <div className="flex items-center gap-1 mt-2 mb-2">
                          <Headphones size={11} className="text-[#555]" />
                          <span className="font-body text-[#555] text-xs">{duration}</span>
                        </div>
                      )}

                      {/* Price + type badge */}
                      <div className="flex items-center justify-between mb-4 mt-3">
                        <span className="font-display text-white font-bold text-2xl">
                          ${Number(product.price).toFixed(2)}
                        </span>
                        <div className="flex items-center gap-1 text-[#555]">
                          {isAudiobook
                            ? <><Headphones size={12} /><span className="font-body text-xs">Stream + Download</span></>
                            : <><Download size={12} /><span className="font-body text-xs">Instant download</span></>
                          }
                        </div>
                      </div>

                      {/* Email + Buy */}
                      <div className="flex flex-col gap-2">
                        <input
                          type="email"
                          placeholder="Your email for access link"
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
                          {loadingId === product.id ? "REDIRECTING..." : isAudiobook ? "BUY NOW — STREAM + DOWNLOAD" : "BUY NOW — INSTANT ACCESS"}
                        </button>
                      </div>

                      {/* Translation Panel */}
                      <TranslationPanel productId={product.id} productName={product.name} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Trust section */}
      <section className="py-12 px-4 border-t border-white/10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
          {[
            { icon: <Lock size={20} />, title: "SECURE PAYMENT", desc: "Powered by Stripe. Your payment info is never stored." },
            { icon: <Headphones size={20} />, title: "STREAM + DOWNLOAD", desc: "Listen online or download to your device. Yours forever." },
            { icon: <Globe size={20} />, title: "12 LANGUAGES", desc: "AI-translated with matching voice audio in your language." },
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
