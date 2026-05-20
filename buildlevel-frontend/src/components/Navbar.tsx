import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/", label: "Home" },
  { to: "/shop", label: "Shop" },
  { to: "/digital", label: "Digital" },
  { to: "/blog", label: "Blog" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: "var(--z-nav)",
      background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      borderBottom: "1px solid var(--border)",
    }}>
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <Link to="/" style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          BUILD <span style={{ color: "var(--red)" }}>LEVEL</span>
        </Link>

        {/* Desktop nav */}
        <div style={{ display: "flex", gap: 32, alignItems: "center" }} className="desktop-nav">
          {links.map(l => (
            <Link key={l.to} to={l.to} style={{
              fontFamily: "var(--font-display)", fontSize: "0.8rem", fontWeight: 500,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: pathname === l.to ? "var(--text)" : "var(--text2)",
              borderBottom: pathname === l.to ? "2px solid var(--red)" : "2px solid transparent",
              paddingBottom: 2, transition: "color 0.2s",
            }} aria-current={pathname === l.to ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{ display: "none", background: "none", border: "none", color: "var(--text)", fontSize: "1.5rem" }}
          className="hamburger"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div id="mobile-menu" style={{ background: "var(--bg2)", borderTop: "1px solid var(--border)", padding: "16px 0" }}>
          {links.map(l => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} style={{
              display: "block", padding: "12px 24px",
              fontFamily: "var(--font-display)", fontSize: "0.9rem",
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: pathname === l.to ? "var(--text)" : "var(--text2)",
            }} aria-current={pathname === l.to ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .hamburger { display: block !important; }
        }
      `}</style>
    </nav>
  );
}
