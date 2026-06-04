import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { Reveal } from "../components/Motion";
import { Stars } from "../components/Engagement";
import { BuildLevelHero, GymMotivationSection, MountainLegacySection } from "../components/PromoVisualSections";
import { publicApi, Product, Review } from "../lib/api";

export default function Home() {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState({ averageRating: 0, count: 0 });
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    publicApi.getProducts().then(p => setFeatured(p.filter(x => x.featured).slice(0, 3))).catch(() => {});
    publicApi.getReviews({ featured: true, limit: 8 }).then(result => { setReviews(result.reviews); setReviewStats({ averageRating: result.averageRating, count: result.count }); }).catch(() => {});
  }, []);

  return (
    <div className="page-chrome">
      {/* Hero */}
      <BuildLevelHero />

      {/* Ticker */}
      <div style={{ background: "var(--red)", padding: "12px 0", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 48, animation: reduceMotion ? "none" : "ticker 20s linear infinite", whiteSpace: "nowrap" }}>
          {Array(6).fill(null).map((_, i) => (
            <span key={i} style={{ fontFamily: "var(--font-display)", fontSize: "0.8rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "#fff" }}>
              DISCIPLINE &nbsp;•&nbsp; FOCUS &nbsp;•&nbsp; EXECUTION &nbsp;•&nbsp; BUILD LEVEL &nbsp;•&nbsp;
            </span>
          ))}
        </div>
        <style>{`@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      </div>

      {/* Featured Products */}
      {featured.length > 0 && (
        <section className="section">
          <div className="container section-shell">
            <Reveal style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 40 }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.2em", color: "var(--red)", marginBottom: 8, textTransform: "uppercase" }}>Featured</div>
                <h2>The Collection</h2>
              </div>
              <Link to="/shop" className="btn btn-ghost">View All →</Link>
            </Reveal>
            <div className="grid-3">
              {featured.map((p, index) => (
                <Reveal key={p.id} delay={index * 0.08} className="card">
                  <div style={{ aspectRatio: "4/5", background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ color: "var(--text3)", fontSize: "0.8rem" }}>No Image</span>
                    )}
                  </div>
                  <div style={{ padding: 20 }}>
                    {p.badge && <span className="badge badge-red" style={{ marginBottom: 8 }}>{p.badge}</span>}
                    <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>{p.name}</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--text)" }}>${parseFloat(p.price).toFixed(2)}</span>
                      {p.compareAtPrice && <span style={{ color: "var(--text3)", textDecoration: "line-through", fontSize: "0.85rem" }}>${parseFloat(p.compareAtPrice).toFixed(2)}</span>}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <GymMotivationSection />

      {/* Mission */}
      <section className="section" style={{ background: "var(--bg2)" }}>
        <div className="container">
          <Reveal style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
            <div style={{ width: 40, height: 2, background: "var(--red)", margin: "0 auto 24px" }} />
            <h2 style={{ marginBottom: 24 }}>The Build Level Standard</h2>
            <p style={{ color: "var(--text2)", fontSize: "1.05rem", lineHeight: 1.8, marginBottom: 32 }}>
              We don't make clothes for spectators. Every piece in the BUILD LEVEL collection is designed for those who show up, do the work, and build something real. Discipline is the foundation. Focus is the tool. Execution is the result.
            </p>
            <Link to="/about" className="btn btn-outline">Our Story</Link>
          </Reveal>
        </div>
      </section>

      <MountainLegacySection />

      {reviews.length > 0 && (
        <section className="section" style={{ background: "var(--bg2)" }}>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "Build Level",
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: reviewStats.averageRating,
                  reviewCount: reviewStats.count,
                },
                review: reviews.slice(0, 5).map(review => ({
                  "@type": "Review",
                  author: review.customerName,
                  reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5 },
                  reviewBody: review.reviewText,
                  datePublished: review.createdAt,
                })),
              }),
            }}
          />
          <div className="container">
            <Reveal style={{ textAlign: "center", maxWidth: 760, margin: "0 auto 36px" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.2em", color: "var(--red)", marginBottom: 8, textTransform: "uppercase" }}>Trusted by Customers</div>
              <h2 style={{ marginBottom: 12 }}>Build Level Reviews</h2>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--text2)" }}>
                <Stars value={reviewStats.averageRating} size={22} />
                <span>{reviewStats.averageRating.toFixed(1)} average from {reviewStats.count} reviews</span>
              </div>
            </Reveal>
            <div className="grid-3">
              {reviews.slice(0, 3).map((review, index) => (
                <Reveal key={review.id} delay={index * 0.08} className="card" style={{ padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {review.avatarUrl ? <img src={review.avatarUrl} alt={review.customerName} style={{ width: 42, height: 42, borderRadius: 999, objectFit: "cover" }} /> : <div style={{ width: 42, height: 42, borderRadius: 999, background: "var(--red)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)" }}>{review.customerName.charAt(0)}</div>}
                      <div>
                        <strong>{review.customerName}</strong>
                        {review.verifiedPurchase && <div className="badge badge-dark" style={{ marginTop: 4 }}>Verified Purchase</div>}
                      </div>
                    </div>
                    <Stars value={review.rating} />
                  </div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.7, marginBottom: 12 }}>{review.reviewText}</p>
                  <p style={{ color: "var(--text3)", fontSize: "0.75rem" }}>{new Date(review.createdAt).toLocaleDateString()}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="section">
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <Reveal style={{ background: "var(--red)", padding: 48, borderRadius: "var(--radius)" }}>
              <h2 style={{ marginBottom: 16, color: "#fff" }}>Apparel</h2>
              <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: 32 }}>Premium streetwear built for those who build.</p>
              <Link to="/shop" className="btn" style={{ background: "#fff", color: "var(--red)" }}>Shop Now</Link>
            </Reveal>
            <Reveal delay={0.08} style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: 48, borderRadius: "var(--radius)" }}>
              <h2 style={{ marginBottom: 16 }}>Digital Resources</h2>
              <p style={{ color: "var(--text2)", marginBottom: 32 }}>Guides, frameworks, and tools to level up your execution.</p>
              <Link to="/digital" className="btn btn-primary">Explore</Link>
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
}
