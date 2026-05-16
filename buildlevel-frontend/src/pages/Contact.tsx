import { useState } from "react";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, wire this to an email service or backend endpoint
    setSent(true);
  };

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "48px 0 32px" }}>
        <div className="container">
          <h1 style={{ marginBottom: 8 }}>Contact</h1>
          <p style={{ color: "var(--text2)" }}>Get in touch with the BUILD LEVEL team.</p>
        </div>
      </div>

      <div className="container" style={{ maxWidth: 600, padding: "64px 24px" }}>
        {sent ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ width: 48, height: 48, background: "var(--red)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: "1.5rem" }}>✓</div>
            <h2 style={{ marginBottom: 12 }}>Message Sent</h2>
            <p style={{ color: "var(--text2)" }}>We'll get back to you soon.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label>Name</label>
              <input className="input" type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" />
            </div>
            <div>
              <label>Email</label>
              <input className="input" type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" />
            </div>
            <div>
              <label>Message</label>
              <textarea className="input" required rows={6} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="How can we help?" style={{ resize: "vertical" }} />
            </div>
            <button type="submit" className="btn btn-primary">Send Message</button>
          </form>
        )}
      </div>
    </div>
  );
}
