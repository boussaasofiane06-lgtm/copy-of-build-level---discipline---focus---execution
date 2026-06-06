import { useEffect, useState } from "react";
import { adminApi, Subscriber } from "../lib/api";

const panelStyle: React.CSSProperties = { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 };

export default function AdminSubscribersPanel({ showToast }: { showToast: (message: string, type?: "success" | "error") => void }) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [interest, setInterest] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setSubscribers(await adminApi.getSubscribers({ search, status, interest }));
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Failed to load subscribers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: number, nextStatus: "active" | "unsubscribed" | "blocked") => {
    if (!window.confirm(`Set subscriber status to ${nextStatus}?`)) return;
    await adminApi.updateSubscriber(id, { status: nextStatus });
    showToast("Subscriber updated");
    load();
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Subscribers</h2>
        <p style={{ color: "var(--text2)", marginBottom: 16 }}>Manage voluntary Build Level email subscribers, consent, preferences, and unsubscribes.</p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto", gap: 10 }}>
          <input className="input" placeholder="Search email or name" value={search} onChange={event => setSearch(event.target.value)} />
          <select className="input" value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="blocked">Blocked</option>
          </select>
          <select className="input" value={interest} onChange={event => setInterest(event.target.value)}>
            <option value="">All interests</option>
            <option value="new_apparel">New Apparel</option>
            <option value="digital_products">Digital Products</option>
            <option value="audiobooks">Audiobooks</option>
            <option value="featured_products">Featured Products</option>
            <option value="blog_motivation">Blog and Motivation</option>
            <option value="build_level_news">Build Level News</option>
            <option value="all_updates">All Updates</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={load}>{loading ? "Loading..." : "Filter"}</button>
          <a className="btn btn-outline btn-sm" href="/api/admin/subscribers/export.csv">Export CSV</a>
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ display: "grid", gap: 12 }}>
          {subscribers.map(subscriber => (
            <div key={subscriber.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, display: "grid", gridTemplateColumns: "1.4fr 1fr auto", gap: 12, alignItems: "center" }}>
              <div>
                <strong>{subscriber.email}</strong>
                <p style={{ color: "var(--text2)", fontSize: "0.85rem" }}>{subscriber.firstName || "No name"} • {subscriber.subscriptionSource || "unknown source"}</p>
                <p style={{ color: "var(--text3)", fontSize: "0.75rem" }}>Subscribed: {subscriber.subscribedAt ? new Date(subscriber.subscribedAt).toLocaleString() : "Unknown"}</p>
              </div>
              <div>
                <span className="badge badge-dark">{subscriber.status}</span>
                {subscriber.preferences && <p style={{ color: "var(--text3)", fontSize: "0.75rem", marginTop: 6 }}>{subscriber.preferences}</p>}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn btn-outline btn-sm" onClick={() => updateStatus(subscriber.id, "active")}>Activate</button>
                <button className="btn btn-outline btn-sm" onClick={() => updateStatus(subscriber.id, "unsubscribed")}>Unsubscribe</button>
                <button className="btn btn-outline btn-sm" onClick={() => updateStatus(subscriber.id, "blocked")}>Block</button>
              </div>
            </div>
          ))}
          {!loading && subscribers.length === 0 && <p style={{ color: "var(--text2)" }}>No subscribers found.</p>}
        </div>
      </div>
    </div>
  );
}
