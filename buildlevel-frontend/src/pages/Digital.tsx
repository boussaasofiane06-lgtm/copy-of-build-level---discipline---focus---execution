import { useEffect, useState } from "react";
import { MountainLegacySection } from "../components/PromoVisualSections";
import { ProductReviewSummary, RecommendationStrip, TrustBadges, type ReviewSummaryData } from "../components/Engagement";
import { publicApi, DigitalProduct } from "../lib/api";

const storageImageUrl = (value?: string | null) => {
  if (!value) return "";
  if (value.startsWith("storage:")) {
    return `/api/digital/thumbnail/${encodeURIComponent(value.slice("storage:".length))}`;
  }
  return value;
};

export default function Digital() {
  const [products, setProducts] = useState<DigitalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingProductId, setPendingProductId] = useState<number | null>(null);
  const [reviewSummaries, setReviewSummaries] = useState<Record<number, ReviewSummaryData>>({});

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

  const handleBuy = async (product: DigitalProduct) => {
    if (pendingProductId !== null) return;
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
  };

  const typeLabel = (t: string) => ({ pdf: "PDF Guide", audiobook: "Audiobook", video: "Video Course", other: "Digital" }[t] || "Digital");

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
            {products.map(p => (
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
                </div>
                <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ marginBottom: 8 }}>
                    <span className="badge badge-dark">{typeLabel(p.productType)}</span>
                    {p.duration && <span style={{ color: "var(--text3)", fontSize: "0.75rem", marginLeft: 8 }}>{p.duration}</span>}
                  </div>
                  <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>{p.name}</h3>
                  <div style={{ marginBottom: 10 }}><ProductReviewSummary summary={reviewSummaries[p.id]} compact /></div>
                  {p.description && <p style={{ color: "var(--text2)", fontSize: "0.85rem", lineHeight: 1.6, marginBottom: 16, flex: 1 }}>{p.description}</p>}
                  <div style={{ marginBottom: 16 }}><TrustBadges type="digital" /></div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>${parseFloat(p.price).toFixed(2)}</span>
                    <button onClick={() => handleBuy(p)} disabled={pendingProductId !== null} className="btn btn-primary btn-sm">
                      {pendingProductId === p.id ? "Redirecting..." : "Get Access"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && products.length > 1 && (
          <RecommendationStrip title="Popular Digital Guides" products={products.map(product => ({ ...product, price: product.price }))} hrefBase="/digital" />
        )}
      </div>
    </div>
  );
}
