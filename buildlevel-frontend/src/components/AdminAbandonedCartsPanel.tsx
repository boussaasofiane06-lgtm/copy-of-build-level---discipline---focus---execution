import { useEffect, useState } from "react";
import { AbandonedCart, RetentionSettings, SavedCart, adminApi } from "../lib/api";

const panelStyle: React.CSSProperties = { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 };

export default function AdminAbandonedCartsPanel({ showToast }: { showToast: (message: string, type?: "success" | "error") => void }) {
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [selected, setSelected] = useState<SavedCart | null>(null);
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [settings, setSettings] = useState<RetentionSettings | null>(null);

  const load = async () => {
    try {
      const [cartRows, summaryData, settingsData] = await Promise.all([
        adminApi.getAbandonedCarts({ status }),
        adminApi.getRetentionSummary(),
        adminApi.getRetentionSettings(),
      ]);
      setCarts(cartRows);
      setSummary(summaryData);
      setSettings(settingsData);
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Failed to load carts", "error");
    }
  };

  useEffect(() => { load(); }, []);

  const open = async (id: number) => {
    const result = await adminApi.getAbandonedCart(id);
    setSelected(result.cart);
  };

  const action = async (id: number, nextAction: "stop" | "resolve" | "enable" | "delete_expired") => {
    if (!window.confirm(`Confirm cart action: ${nextAction}?`)) return;
    await adminApi.updateAbandonedCart(id, nextAction);
    showToast("Cart updated");
    load();
  };

  const sendReminder = async (id: number) => {
    if (!window.confirm("Send an abandoned-cart reminder email now?")) return;
    const result = await adminApi.sendAbandonedCartReminder(id);
    showToast(result.skipped ? (result.message || "Reminder logged") : "Reminder sent");
    load();
  };

  const saveSettings = async () => {
    if (!settings) return;
    await adminApi.saveRetentionSettings(settings);
    showToast("Recovery settings saved");
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {[
          ["Active carts", summary?.carts?.activeCarts || 0],
          ["Recovered carts", summary?.carts?.recoveredCarts || 0],
          ["Revenue recovered", `$${Number(summary?.carts?.revenueRecovered || 0).toFixed(2)}`],
          ["Subscribers", summary?.subscribers?.totalSubscribers || 0],
          ["New 30 days", summary?.subscribers?.newSubscribersThisMonth || 0],
          ["Unsubscribed", summary?.subscribers?.unsubscribeCount || 0],
        ].map(([label, value]) => (
          <div key={label} style={panelStyle}>
            <p style={{ color: "var(--text3)", fontSize: "0.75rem" }}>{label}</p>
            <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem" }}>{value}</strong>
          </div>
        ))}
      </div>

      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Abandoned Cart Recovery</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <select className="input" value={status} onChange={event => setStatus(event.target.value)} style={{ maxWidth: 220 }}>
            <option value="">All carts</option>
            <option value="active">Active</option>
            <option value="eligible">Eligible</option>
            <option value="recovered">Recovered</option>
            <option value="paused">Paused</option>
            <option value="resolved">Resolved</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={load}>Refresh</button>
        </div>
        {settings && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 18 }}>
            <label><span>Enabled</span><select className="input" value={settings.recoveryEnabled ? "true" : "false"} onChange={event => setSettings({ ...settings, recoveryEnabled: event.target.value === "true" })}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
            <label><span>Abandon after minutes</span><input className="input" type="number" value={settings.abandonedAfterMinutes} onChange={event => setSettings({ ...settings, abandonedAfterMinutes: Number(event.target.value) })} /></label>
            <label><span>First reminder hours</span><input className="input" type="number" value={settings.firstReminderHours} onChange={event => setSettings({ ...settings, firstReminderHours: Number(event.target.value) })} /></label>
            <label><span>Second reminder hours</span><input className="input" type="number" value={settings.secondReminderHours} onChange={event => setSettings({ ...settings, secondReminderHours: Number(event.target.value) })} /></label>
            <label style={{ gridColumn: "1/-1" }}><span>Reminder subject</span><input className="input" value={settings.reminderSubject} onChange={event => setSettings({ ...settings, reminderSubject: event.target.value })} /></label>
            <label style={{ gridColumn: "1/-1" }}><span>Reminder intro</span><textarea className="input" rows={3} value={settings.reminderIntro} onChange={event => setSettings({ ...settings, reminderIntro: event.target.value })} /></label>
            <button className="btn btn-primary btn-sm" onClick={saveSettings}>Save Recovery Settings</button>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.85fr)", gap: 18 }}>
        <div style={panelStyle}>
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Carts</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {carts.map(cart => (
              <div key={cart.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <strong>{cart.customerEmail || "Anonymous cart"}</strong>
                    <p style={{ color: "var(--text2)", fontSize: "0.85rem" }}>{cart.itemCount} items • ${Number(cart.subtotal || 0).toFixed(2)} • {cart.status}</p>
                    <p style={{ color: "var(--text3)", fontSize: "0.75rem" }}>Last activity: {cart.lastActivityAt ? new Date(cart.lastActivityAt).toLocaleString() : "Unknown"}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button className="btn btn-outline btn-sm" onClick={() => open(cart.id)}>View</button>
                    <button className="btn btn-outline btn-sm" onClick={() => sendReminder(cart.id)}>Send Reminder</button>
                    <button className="btn btn-outline btn-sm" onClick={() => action(cart.id, "stop")}>Stop</button>
                    <button className="btn btn-outline btn-sm" onClick={() => action(cart.id, "resolve")}>Resolve</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={panelStyle}>
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Cart Details</h3>
          {selected ? (
            <div>
              <p style={{ color: "var(--text2)", marginBottom: 10 }}>{selected.customerEmail || "Anonymous"} • ${selected.subtotal.toFixed(2)}</p>
              <div style={{ display: "grid", gap: 10 }}>
                {selected.items.map(item => (
                  <div key={`${item.productType}-${item.productId}-${item.selectedVariant}`} style={{ border: "1px solid var(--border)", padding: 10, borderRadius: 8 }}>
                    <strong>{item.productName}</strong>
                    <p style={{ color: "var(--text3)", fontSize: "0.78rem" }}>{item.productType} • {item.selectedVariant || item.selectedSize || "default"} • Qty {item.quantity}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : <p style={{ color: "var(--text2)" }}>Select a cart to inspect products and recovery status.</p>}
        </div>
      </div>
    </div>
  );
}
