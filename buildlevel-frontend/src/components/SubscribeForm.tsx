import { FormEvent, useState } from "react";
import { publicApi } from "../lib/api";

export const SUBSCRIPTION_INTERESTS = [
  { value: "new_apparel", label: "New Apparel" },
  { value: "digital_products", label: "Digital Products" },
  { value: "audiobooks", label: "Audiobooks" },
  { value: "featured_products", label: "Featured Products" },
  { value: "blog_motivation", label: "Blog and Motivation" },
  { value: "build_level_news", label: "Build Level News" },
  { value: "all_updates", label: "All Updates" },
];

export default function SubscribeForm({ source = "website", compact = false }: { source?: string; compact?: boolean }) {
  const [form, setForm] = useState({ email: "", firstName: "", interests: ["all_updates"], consent: false });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const toggleInterest = (value: string) => {
    setForm(current => {
      const exists = current.interests.includes(value);
      const next = exists ? current.interests.filter(item => item !== value) : [...current.interests, value];
      return { ...current, interests: next.length ? next : ["all_updates"] };
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError("");
    setStatus("");
    try {
      const result = await publicApi.subscribe({ ...form, source });
      setStatus(result.message || "You're in. Welcome to Build Level.");
      setForm(current => ({ ...current, email: "", firstName: "", consent: false }));
    } catch (submitError: any) {
      setError(submitError?.response?.data?.error || "Subscription failed. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="subscribe-form">
      <div>
        <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", letterSpacing: "0.16em", textTransform: "uppercase", fontSize: "0.72rem", marginBottom: 8 }}>
          Build Your Inbox
        </p>
        <h3 style={{ fontSize: compact ? "1rem" : "1.35rem", marginBottom: 8 }}>Build Your Inbox</h3>
        <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: compact ? "0.85rem" : "0.95rem" }}>
          Get new product releases, featured drops, digital guides, Build Level news, and exclusive updates.
        </p>
      </div>
      <div className="subscribe-form__fields">
        <input className="input" type="text" placeholder="First name (optional)" value={form.firstName} onChange={event => setForm(current => ({ ...current, firstName: event.target.value }))} />
        <input className="input" required type="email" placeholder="Email address" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} />
      </div>
      <div className="subscribe-interest-grid">
        {SUBSCRIPTION_INTERESTS.map(interest => (
          <label key={interest.value} className="subscribe-interest">
            <input type="checkbox" checked={form.interests.includes(interest.value)} onChange={() => toggleInterest(interest.value)} />
            <span>{interest.label}</span>
          </label>
        ))}
      </div>
      <label style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.5 }}>
        <input type="checkbox" required checked={form.consent} onChange={event => setForm(current => ({ ...current, consent: event.target.checked }))} />
        <span>I agree to receive Build Level product and newsletter emails. I can unsubscribe or manage preferences anytime.</span>
      </label>
      {status && <p style={{ color: "#ff6600", fontSize: "0.85rem" }}>{status}</p>}
      {error && <p style={{ color: "var(--red)", fontSize: "0.85rem" }}>{error}</p>}
      <button type="submit" disabled={sending} className="btn btn-primary" style={{ width: "100%" }}>
        {sending ? "Joining..." : "JOIN BUILD LEVEL"}
      </button>
    </form>
  );
}
