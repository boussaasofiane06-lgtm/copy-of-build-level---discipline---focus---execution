import { useEffect, useState } from "react";
import { MonthlyDigestQueueItem, MonthlyDigestSettings, adminApi } from "../lib/api";

const panelStyle: React.CSSProperties = { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 };

const defaultSettings: MonthlyDigestSettings = {
  enabled: true,
  dayOfMonth: 1,
  dayName: "first_monday",
  time: "10:00",
  timezone: "America/New_York",
  subject: "Build Level Monthly — New Drops, Digital Guides & Updates",
  introduction: "One focused update. New releases, selected resources, and what's happening at Build Level.",
  status: "draft",
};

export default function AdminEmailCampaignsPanel({ showToast }: { showToast: (message: string, type?: "success" | "error") => void }) {
  const [settings, setSettings] = useState<MonthlyDigestSettings>(defaultSettings);
  const [queue, setQueue] = useState<MonthlyDigestQueueItem[]>([]);
  const [preview, setPreview] = useState<{ html: string; eligibleSubscribers: number; subject: string } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [audience, setAudience] = useState<string[]>(["all_updates"]);

  const load = async () => {
    try {
      const [settingsData, queueData, previewData] = await Promise.all([
        adminApi.getMonthlyDigestSettings(),
        adminApi.getMonthlyDigestQueue(),
        adminApi.previewMonthlyDigest(audience),
      ]);
      setSettings({ ...defaultSettings, ...settingsData });
      setQueue(queueData);
      setPreview(previewData);
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Failed to load monthly digest", "error");
    }
  };

  useEffect(() => { load(); }, []);

  const refreshQueue = async () => {
    const result = await adminApi.refreshMonthlyDigestQueue();
    setQueue(result.queue);
    showToast("Monthly Digest queue refreshed");
    load();
  };

  const saveSettings = async () => {
    await adminApi.saveMonthlyDigestSettings(settings);
    showToast("Monthly Digest settings saved");
    load();
  };

  const toggleQueue = async (item: MonthlyDigestQueueItem) => {
    await adminApi.updateMonthlyDigestQueueItem(item.id, { included: !Boolean(item.included) });
    load();
  };

  const moveQueue = async (item: MonthlyDigestQueueItem, delta: number) => {
    await adminApi.updateMonthlyDigestQueueItem(item.id, { sortOrder: Number(item.sortOrder || 0) + delta });
    load();
  };

  const sendTest = async () => {
    if (!testEmail) { showToast("Enter a test email first", "error"); return; }
    const result = await adminApi.sendMonthlyDigestTest(testEmail);
    showToast(result.skipped ? result.message || "Test skipped" : "Test email sent");
  };

  const sendNow = async () => {
    if (!window.confirm("Send this approved Monthly Digest now? Subscribers are protected from duplicate campaign recipients.")) return;
    const result = await adminApi.sendMonthlyDigestNow(audience);
    showToast(`Monthly Digest processed. Sent: ${result.sent}. Failed: ${result.failed}.`);
    load();
  };

  const toggleAudience = (value: string) => {
    setAudience(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Email Campaigns → Monthly Digest</h2>
        <p style={{ color: "var(--text2)", marginBottom: 16 }}>
          One admin-approved monthly marketing email. Product edits and blog publishing do not send emails automatically.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <label><span>Enabled</span><select className="input" value={settings.enabled ? "true" : "false"} onChange={event => setSettings(s => ({ ...s, enabled: event.target.value === "true" }))}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
          <label><span>Schedule rule</span><select className="input" value={settings.dayName} onChange={event => setSettings(s => ({ ...s, dayName: event.target.value }))}><option value="first_monday">First Monday</option><option value="first_day">First day of month</option><option value="manual">Manual only</option></select></label>
          <label><span>Time</span><input className="input" value={settings.time} onChange={event => setSettings(s => ({ ...s, time: event.target.value }))} /></label>
          <label><span>Timezone</span><input className="input" value={settings.timezone} onChange={event => setSettings(s => ({ ...s, timezone: event.target.value }))} /></label>
          <label style={{ gridColumn: "1/-1" }}><span>Subject</span><input className="input" value={settings.subject} onChange={event => setSettings(s => ({ ...s, subject: event.target.value }))} /></label>
          <label style={{ gridColumn: "1/-1" }}><span>Introduction</span><textarea className="input" rows={3} value={settings.introduction} onChange={event => setSettings(s => ({ ...s, introduction: event.target.value }))} /></label>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button className="btn btn-primary btn-sm" onClick={saveSettings}>Save Settings</button>
          <button className="btn btn-outline btn-sm" onClick={refreshQueue}>Refresh Queue</button>
          <button className="btn btn-outline btn-sm" onClick={load}>Preview</button>
        </div>
      </div>

      <div style={panelStyle}>
        <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Subscriber Audience</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["all_updates", "All Updates"],
            ["new_apparel", "New Apparel"],
            ["digital_products", "Digital Products"],
            ["audiobooks", "Audiobooks"],
            ["featured_products", "Featured Products"],
            ["blog_motivation", "Blog and Motivation"],
            ["build_level_news", "Build Level News"],
          ].map(([value, label]) => (
            <label key={value} className="subscribe-interest">
              <input type="checkbox" checked={audience.includes(value)} onChange={() => toggleAudience(value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.8fr)", gap: 18 }}>
        <div style={panelStyle}>
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Monthly Digest Queue</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {queue.map(item => (
              <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                <div>
                  <strong>{item.title}</strong>
                  <p style={{ color: "var(--text3)", fontSize: "0.78rem" }}>{item.contentType} • Added {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "recently"} {item.includedInCampaignId ? "• Previously included" : ""}</p>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button className="btn btn-outline btn-sm" onClick={() => toggleQueue(item)}>{item.included ? "Exclude" : "Include"}</button>
                  <button className="btn btn-outline btn-sm" onClick={() => moveQueue(item, -1)}>↑</button>
                  <button className="btn btn-outline btn-sm" onClick={() => moveQueue(item, 1)}>↓</button>
                </div>
              </div>
            ))}
            {queue.length === 0 && <p style={{ color: "var(--text2)" }}>No digest items yet. Refresh the queue to collect eligible published content.</p>}
          </div>
        </div>
        <div style={panelStyle}>
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Preview & Approval</h3>
          <p style={{ color: "var(--text2)", marginBottom: 12 }}>Eligible subscribers: {preview?.eligibleSubscribers ?? 0}</p>
          <input className="input" type="email" placeholder="Test email" value={testEmail} onChange={event => setTestEmail(event.target.value)} style={{ marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <button className="btn btn-outline btn-sm" onClick={sendTest}>Send Test</button>
            <button className="btn btn-primary btn-sm" onClick={sendNow}>Send Approved Digest</button>
          </div>
          {preview?.html && <iframe title="Monthly Digest Preview" srcDoc={preview.html} style={{ width: "100%", minHeight: 420, border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }} />}
        </div>
      </div>
    </div>
  );
}
