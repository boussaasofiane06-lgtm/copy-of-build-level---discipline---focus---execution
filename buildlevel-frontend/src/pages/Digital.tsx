import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MountainLegacySection } from "../components/PromoVisualSections";
import { ProductReviewSummary, ProductReviews, RecommendationStrip, TrustBadges, type ReviewSummaryData } from "../components/Engagement";
import { publicApi, DigitalProduct } from "../lib/api";
import { useCart } from "../context/CartContext";

const storageImageUrl = (value?: string | null) => {
  if (!value) return "";
  if (value.startsWith("storage:")) {
    return `/api/digital/thumbnail/${encodeURIComponent(value.slice("storage:".length))}`;
  }
  return value;
};

const typeLabel = (t: string) => ({ pdf: "PDF Guide", audiobook: "Audiobook", video: "Video Course", other: "Digital" }[t] || "Digital");

const isScheduledDigital = (product: DigitalProduct, now = new Date()) => {
  if (product.published || !product.scheduledAt) return false;
  const scheduled = new Date(product.scheduledAt);
  return !Number.isNaN(scheduled.getTime()) && scheduled > now;
};

const releaseCountdown = (scheduledAt?: string | null, now = new Date()) => {
  if (!scheduledAt) return "";
  const scheduled = new Date(scheduledAt);
  if (Number.isNaN(scheduled.getTime())) return "";
  const diff = scheduled.getTime() - now.getTime();
  if (diff <= 0) return "Available soon";
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
};

async function startDigitalCheckout(product: DigitalProduct, setPendingProductId: (id: number | null) => void) {
  if (isScheduledDigital(product)) {
    alert("This digital product is coming soon. Access opens when the countdown ends.");
    return;
  }
  setPendingProductId(product.id);

  if (product.stripePaymentLink) {
    window.location.assign(product.stripePaymentLink);
    return;
  }

  try {
    const { url } = await publicApi.createDigitalCheckout(product.id);
    window.location.assign(url);
  } catch {
    alert("Checkout failed. Please try again.");
    setPendingProductId(null);
  }
}

export default function Digital() {
  const cart = useCart();
  const [products, setProducts] = useState<DigitalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingProductId, setPendingProductId] = useState<number | null>(null);
  const [reviewSummaries, setReviewSummaries] = useState<Record<number, ReviewSummaryData>>({});
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    publicApi.getDigitalProducts().then(p => { setProducts(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!products.length) return;
    Promise.all(products.map(product =>
      publicApi.getReviews({ targetType: "digital", targetId: product.id, limit: 4 })
        .then(summary => [product.id, summary] as const)
        .catch(() => [product.id, { reviews: [], averageRating: 0, count: 0 }] as const)
    )).then(entries => setReviewSummaries(Object.fromEntries(entries)));
  }, [products]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const handleBuy = async (product: DigitalProduct) => {
    if (pendingProductId !== null) return;
    await startDigitalCheckout(product, setPendingProductId);
  };

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "48px 0 32px" }}>
        <div className="container">
          <h1 style={{ marginBottom: 8 }}>Digital Resources</h1>
          <p style={{ color: "var(--text2)" }}>Guides, frameworks, and tools to level up your execution.</p>
        </div>
      </div>

      <MountainLegacySection title="Stay Focused." />

      <div className="container section-sm">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><div className="spinner" /></div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--text2)" }}>
            <p style={{ fontSize: "1.1rem", marginBottom: 8 }}>No digital products available yet.</p>
            <p style={{ fontSize: "0.9rem" }}>Check back soon.</p>
          </div>
        ) : (
          <div className="grid-3">
            {products.map(p => {
              const comingSoon = isScheduledDigital(p, now);
              return (
              <div key={p.id} className="card" style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ aspectRatio: "16/9", background: "var(--bg3)", overflow: "hidden", position: "relative" }}>
                  {p.imageUrl ? (
                    <img src={storageImageUrl(p.imageUrl)} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 8 }}>
                      <span style={{ fontSize: "2rem" }}>{p.productType === "pdf" ? "📄" : p.productType === "audiobook" ? "🎧" : p.productType === "video" ? "🎬" : "📦"}</span>
                      <span style={{ color: "var(--text3)", fontSize: "0.75rem" }}>{typeLabel(p.productType)}</span>
                    </div>
                  )}
                  {p.badge && <span className="badge badge-red" style={{ position: "absolute", top: 12, left: 12 }}>{p.badge}</span>}
                  {comingSoon && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 18 }}>
                      <div>
                        <span className="badge badge-red">Coming Soon</span>
                        <p style={{ color: "#fff", fontFamily: "var(--font-display)", fontSize: "1rem", marginTop: 10 }}>{releaseCountdown(p.scheduledAt, now)}</p>
                        <p style={{ color: "rgba(255,255,255,0.78)", fontSize: "0.72rem", marginTop: 6 }}>{p.scheduledAt ? new Date(p.scheduledAt).toLocaleString() : ""}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ marginBottom: 8 }}>
                    <span className="badge badge-dark">{typeLabel(p.productType)}</span>
                    {p.duration && <span style={{ color: "var(--text3)", fontSize: "0.75rem", marginLeft: 8 }}>{p.duration}</span>}
                  </div>
                  <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>{p.name}</h3>
                  {comingSoon ? (
                    <div style={{ flex: 1, border: "1px solid rgba(192,57,43,0.45)", borderRadius: 8, padding: 12, margin: "8px 0 16px", background: "rgba(192,57,43,0.08)" }}>
                      <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Available after countdown</p>
                      <p style={{ color: "var(--text2)", fontSize: "0.85rem" }}>Preview only. Access opens when this product is published.</p>
                    </div>
                  ) : (
                    <>
                      <div style={{ marginBottom: 10 }}><ProductReviewSummary summary={reviewSummaries[p.id]} compact /></div>
                      {p.description && <p style={{ color: "var(--text2)", fontSize: "0.85rem", lineHeight: 1.6, marginBottom: 16, flex: 1 }}>{p.description}</p>}
                      <div style={{ marginBottom: 16 }}><TrustBadges type="digital" /></div>
                    </>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: comingSoon ? "0.9rem" : "1.2rem", color: comingSoon ? "var(--text2)" : "var(--text)" }}>{comingSoon ? "Coming Soon" : `$${parseFloat(p.price).toFixed(2)}`}</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button onClick={() => !comingSoon && cart.addDigital(p)} disabled={comingSoon} className="btn btn-outline btn-sm">Add to Cart</button>
                      <button onClick={() => handleBuy(p)} disabled={comingSoon || pendingProductId !== null} className="btn btn-primary btn-sm">
                        {comingSoon ? "Coming Soon" : pendingProductId === p.id ? "Redirecting..." : "Get Access"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
        {!loading && products.length > 1 && (
          <RecommendationStrip title="Popular Digital Guides" products={products.map(product => ({ ...product, price: product.price }))} hrefBase="/digital" />
        )}
      </div>
    </div>
  );
}

export function DigitalDetail() {
  const cart = useCart();
  const { productId } = useParams();
  const selectedId = Number(productId);
  const [products, setProducts] = useState<DigitalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingProductId, setPendingProductId] = useState<number | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummaryData>({ reviews: [], averageRating: 0, count: 0 });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    publicApi.getDigitalProducts()
      .then(p => { setProducts(p); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedId]);

  const product = products.find(item => item.id === selectedId);

  useEffect(() => {
    if (!product) return;
    publicApi.getReviews({ targetType: "digital", targetId: product.id, limit: 8 })
      .then(setReviewSummary)
      .catch(() => setReviewSummary({ reviews: [], averageRating: 0, count: 0 }));
  }, [product?.id]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const handleBuy = async () => {
    if (!product || pendingProductId !== null) return;
    await startDigitalCheckout(product, setPendingProductId);
  };

  if (loading) {
    return (
      <div className="container section-sm" style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!product || !Number.isInteger(selectedId)) {
    return (
      <div className="container section-sm" style={{ maxWidth: 720, textAlign: "center" }}>
        <h1 style={{ marginBottom: 12 }}>Digital Guide Not Found</h1>
        <p style={{ color: "var(--text2)", marginBottom: 24 }}>This guide is not available right now.</p>
        <Link to="/digital" className="btn btn-primary">Back to Digital Products</Link>
      </div>
    );
  }

  const comingSoon = isScheduledDigital(product, now);

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "48px 0 32px" }}>
        <div className="container">
          <Link to="/digital" style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Back to Digital Products
          </Link>
          <h1 style={{ margin: "12px 0 8px" }}>{product.name}</h1>
          <p style={{ color: "var(--text2)" }}>{typeLabel(product.productType)}{product.duration ? ` • ${product.duration}` : ""}</p>
        </div>
      </div>

      <div className="container section-sm">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.95fr) minmax(320px, 1.05fr)", gap: 28, alignItems: "start" }} className="digital-detail-grid">
          <div className="card" style={{ padding: 18 }}>
            <div style={{ width: "100%", minHeight: 320, height: "clamp(320px, 48vw, 620px)", background: "linear-gradient(145deg, #090909, var(--bg3))", borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              {product.imageUrl ? (
                <img src={storageImageUrl(product.imageUrl)} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", display: "block" }} />
              ) : (
                <div style={{ color: "var(--text3)", textAlign: "center" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>{product.productType === "pdf" ? "📄" : product.productType === "audiobook" ? "🎧" : product.productType === "video" ? "🎬" : "📦"}</div>
                  <p>{typeLabel(product.productType)}</p>
                </div>
              )}
              {comingSoon && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.58)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
                  <div>
                    <span className="badge badge-red">Coming Soon</span>
                    <p style={{ color: "#fff", fontFamily: "var(--font-display)", fontSize: "1.25rem", marginTop: 12 }}>{releaseCountdown(product.scheduledAt, now)}</p>
                    <p style={{ color: "rgba(255,255,255,0.78)", fontSize: "0.78rem", marginTop: 6 }}>{product.scheduledAt ? new Date(product.scheduledAt).toLocaleString() : ""}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <span className="badge badge-dark">{typeLabel(product.productType)}</span>
              {product.badge && <span className="badge badge-red">{product.badge}</span>}
            </div>
            <ProductReviewSummary summary={reviewSummary} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, margin: "22px 0" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: comingSoon ? "1rem" : "1.7rem", color: comingSoon ? "var(--text2)" : "var(--text)" }}>{comingSoon ? "Coming Soon" : `$${parseFloat(product.price).toFixed(2)}`}</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={() => !comingSoon && cart.addDigital(product)} disabled={comingSoon} className="btn btn-outline">Add to Cart</button>
                <button onClick={handleBuy} disabled={comingSoon || pendingProductId !== null} className="btn btn-primary">
                  {comingSoon ? "Coming Soon" : pendingProductId === product.id ? "Redirecting..." : "Get Access"}
                </button>
              </div>
            </div>
            {comingSoon ? (
              <div style={{ border: "1px solid rgba(192,57,43,0.45)", borderRadius: 10, padding: 14, marginBottom: 22, background: "rgba(192,57,43,0.08)" }}>
                <strong style={{ color: "var(--red)" }}>Preview only</strong>
                <p style={{ color: "var(--text2)", marginTop: 6 }}>This digital product is being prepared. Full details and access open when the countdown ends.</p>
              </div>
            ) : (
              <>
                {product.description && <p style={{ color: "var(--text2)", lineHeight: 1.8, whiteSpace: "pre-line", marginBottom: 22 }}>{product.description}</p>}
                <div style={{ marginBottom: 22 }}><TrustBadges type="digital" /></div>
                <ProductReviews summary={reviewSummary} />
              </>
            )}
          </div>
        </div>

        <RecommendationStrip
          title="Popular Digital Guides"
          products={products.map(item => ({ ...item, price: item.price }))}
          hrefBase="/digital"
          currentProductId={product.id}
        />
      </div>
    </div>
  );
}
