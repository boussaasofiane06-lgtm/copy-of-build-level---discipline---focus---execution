import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { publicApi, Product } from "../lib/api";

export default function Home() {
  const [featured, setFeatured] = useState<Product[]>([]);

  useEffect(() => {
    publicApi.getProducts().then(p => setFeatured(p.filter(x => x.featured).slice(0, 3))).catch(() => {});
  }, []);

  return (
    <div>
      {/* Hero */}
      <section style={{
        minHeight: "90vh", display: "flex", alignItems: "center",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 50%, #0a0a0a 100%)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.03,
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 40px, #fff 40px, #fff 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, #fff 40px, #fff 41px)",
        }} />
        <div className="container" style={{ position: "relative", zIndex: 1 }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <div style={{ width: 40, height: 2, background: "var(--red)" }} />
              <span style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.2em", color: "var(--red)", textTransform: "uppercase" }}>
                The Standard
              </span>
            </div>
            <h1 style={{ marginBottom: 24, lineHeight: 1 }}>
              Build With<br />
              <span style={{ color: "var(--red)" }}>Discipline.</span><br />
              Execute With<br />Purpose.
            </h1>
            <p style={{ color: "var(--text2)", fontSize: "1.1rem", maxWidth: 480, marginBottom: 40, lineHeight: 1.7 }}>
              Premium streetwear and digital resources for those who refuse to settle. Every piece is built for the builder.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Link to="/shop" className="btn btn-primary btn-lg">Shop Collection</Link>
              <Link to="/digital" className="btn btn-outline btn-lg">Digital Resources</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <div style={{ background: "var(--red)", padding: "12px 0", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 48, animation: "ticker 20s linear infinite", whiteSpace: "nowrap" }}>
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
          <div className="container">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 40 }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.2em", color: "var(--red)", marginBottom: 8, textTransform: "uppercase" }}>Featured</div>
                <h2>The Collection</h2>
              </div>
              <Link to="/shop" className="btn btn-ghost">View All →</Link>
            </div>
            <div className="grid-3">
              {featured.map(p => (
                <div key={p.id} className="card">
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
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Mission */}
      <section className="section" style={{ background: "var(--bg2)" }}>
        <div className="container">
          <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
            <div style={{ width: 40, height: 2, background: "var(--red)", margin: "0 auto 24px" }} />
            <h2 style={{ marginBottom: 24 }}>The Build Level Standard</h2>
            <p style={{ color: "var(--text2)", fontSize: "1.05rem", lineHeight: 1.8, marginBottom: 32 }}>
              We don't make clothes for spectators. Every piece in the BUILD LEVEL collection is designed for those who show up, do the work, and build something real. Discipline is the foundation. Focus is the tool. Execution is the result.
            </p>
            <Link to="/about" className="btn btn-outline">Our Story</Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div style={{ background: "var(--red)", padding: 48, borderRadius: "var(--radius)" }}>
              <h2 style={{ marginBottom: 16, color: "#fff" }}>Apparel</h2>
              <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: 32 }}>Premium streetwear built for those who build.</p>
              <Link to="/shop" className="btn" style={{ background: "#fff", color: "var(--red)" }}>Shop Now</Link>
            </div>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: 48, borderRadius: "var(--radius)" }}>
              <h2 style={{ marginBottom: 16 }}>Digital Resources</h2>
              <p style={{ color: "var(--text2)", marginBottom: 32 }}>Guides, frameworks, and tools to level up your execution.</p>
              <Link to="/digital" className="btn btn-primary">Explore</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
