import { Link } from "react-router-dom";
import SocialLinks from "./SocialLinks";
import SubscribeForm from "./SubscribeForm";

export default function Footer() {
  return (
    <footer style={{ background: "var(--bg2)", borderTop: "1px solid var(--border)", padding: "48px 0 24px" }}>
      <div className="container">
        <div className="footer-legacy-card">
          <div>
            <div style={{ fontFamily: "var(--font-display)", color: "var(--red)", letterSpacing: "0.18em", fontSize: "0.72rem", textTransform: "uppercase", marginBottom: 8 }}>Built Different</div>
            <h2 style={{ marginBottom: 8 }}>Stay Focused. Execute Daily.</h2>
          </div>
        </div>
        <div style={{ marginBottom: 40 }}>
          <SubscribeForm source="footer" compact />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 40, marginBottom: 40 }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 12 }}>
              BUILD <span style={{ color: "var(--red)" }}>LEVEL</span>
            </div>
            <p style={{ color: "var(--text2)", fontSize: "0.85rem", lineHeight: 1.7 }}>
              Discipline. Focus. Execution.<br />
              Built for those who build.
            </p>
            <div style={{ marginTop: 16 }}>
              <SocialLinks />
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.15em", color: "var(--text2)", marginBottom: 16, textTransform: "uppercase" }}>Shop</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[["Apparel", "/shop"], ["Digital", "/digital"], ["Blog", "/blog"]].map(([label, to]) => (
                <Link key={to} to={to} style={{ color: "var(--text3)", fontSize: "0.85rem", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text3)")}
                >{label}</Link>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.15em", color: "var(--text2)", marginBottom: 16, textTransform: "uppercase" }}>Company</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[["About", "/about"], ["Contact", "/contact"]].map(([label, to]) => (
                <Link key={to} to={to} style={{ color: "var(--text3)", fontSize: "0.85rem", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text3)")}
                >{label}</Link>
              ))}
              <a href="mailto:info@thebuildlevel.com" style={{ color: "var(--text3)", fontSize: "0.85rem", transition: "color 0.2s" }}>info@thebuildlevel.com</a>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.15em", color: "var(--text2)", marginBottom: 16, textTransform: "uppercase" }}>Policies</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                ["Policy Center", "/policies"],
                ["Returns & Refunds", "/policies/return-refund-policy"],
                ["Shipping", "/policies/shipping-policy"],
                ["Digital Products", "/policies/digital-product-policy"],
                ["Privacy", "/policies/privacy-policy"],
                ["Terms", "/policies/terms-conditions"],
                ["FAQ", "/faq"],
              ].map(([label, to]) => (
                <Link key={to} to={to} style={{ color: "var(--text3)", fontSize: "0.85rem", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text3)")}
                >{label}</Link>
              ))}
            </div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <p style={{ color: "var(--text3)", fontSize: "0.8rem" }}>© {new Date().getFullYear()} BUILD LEVEL. All rights reserved.</p>
          <p style={{ color: "var(--text3)", fontSize: "0.8rem" }}>Discipline • Focus • Execution</p>
        </div>
      </div>
    </footer>
  );
}
