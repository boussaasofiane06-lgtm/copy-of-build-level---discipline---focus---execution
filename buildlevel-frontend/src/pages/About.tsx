export default function About() {
  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "48px 0 32px" }}>
        <div className="container">
          <h1 style={{ marginBottom: 8 }}>About BUILD LEVEL</h1>
          <p style={{ color: "var(--text2)" }}>The standard for those who build.</p>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 800, padding: "64px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div style={{ width: 40, height: 2, background: "var(--red)" }} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.2em", color: "var(--red)", textTransform: "uppercase" }}>Our Story</span>
        </div>

        <h2 style={{ marginBottom: 24 }}>Built for Builders</h2>
        <p style={{ color: "var(--text2)", lineHeight: 1.9, fontSize: "1.05rem", marginBottom: 32 }}>
          BUILD LEVEL was created for one type of person: the builder. The one who shows up every day, does the work without applause, and understands that discipline is the foundation of everything worth having.
        </p>
        <p style={{ color: "var(--text2)", lineHeight: 1.9, fontSize: "1.05rem", marginBottom: 32 }}>
          We don't make clothes for spectators. Every piece in our collection is designed as a statement of intent — a reminder that you are here to build, not to watch.
        </p>
        <p style={{ color: "var(--text2)", lineHeight: 1.9, fontSize: "1.05rem", marginBottom: 48 }}>
          Our digital resources extend that philosophy into your work and mindset. Frameworks, guides, and tools built by builders, for builders.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, borderTop: "1px solid var(--border)", paddingTop: 48 }}>
          {[
            { label: "Discipline", desc: "The foundation of every achievement worth having." },
            { label: "Focus", desc: "The tool that separates builders from dreamers." },
            { label: "Execution", desc: "The only thing that actually matters in the end." },
          ].map(v => (
            <div key={v.label} style={{ textAlign: "center" }}>
              <div style={{ width: 2, height: 32, background: "var(--red)", margin: "0 auto 16px" }} />
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>{v.label}</h3>
              <p style={{ color: "var(--text2)", fontSize: "0.85rem", lineHeight: 1.6 }}>{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
