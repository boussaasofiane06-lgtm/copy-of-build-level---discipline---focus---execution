import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { adminApi, IntegrationOverview, SocialPlatformSetting, StripeDashboard, TidioConfig } from "../lib/api";

const panelStyle = {
  background: "linear-gradient(145deg, rgba(26,26,26,0.96), rgba(10,10,10,0.96))",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 18px 45px rgba(0,0,0,0.28)",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--bg3)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  fontSize: "0.85rem",
};

const labelStyle = {
  display: "block",
  fontSize: "0.68rem",
  color: "var(--text2)",
  marginBottom: 6,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const socialLabels: Record<SocialPlatformSetting["platform"], string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X / Twitter",
  pinterest: "Pinterest",
};

function StatusPill({ active, label }: { active: boolean; label?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: "0.68rem",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: active ? "#fff" : "var(--text2)",
        background: active ? "rgba(192,57,43,0.28)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? "rgba(192,57,43,0.55)" : "var(--border)"}`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: active ? "var(--red)" : "var(--text3)" }} />
      {label || (active ? "Connected" : "Setup required")}
    </span>
  );
}

function IntegrationCard({
  title,
  connected,
  meta,
  capabilities,
  onTest,
}: {
  title: string;
  connected: boolean;
  meta: string;
  capabilities: string[];
  onTest?: () => void;
}) {
  return (
    <motion.div
      style={panelStyle}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h4 style={{ fontSize: "0.95rem", marginBottom: 6 }}>{title}</h4>
          <p style={{ color: "var(--text2)", fontSize: "0.8rem" }}>{meta}</p>
        </div>
        <StatusPill active={connected} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {capabilities.map((capability) => (
          <span key={capability} className="badge badge-dark">{capability}</span>
        ))}
      </div>
      {onTest && (
        <button type="button" onClick={onTest} className="btn btn-outline btn-sm">
          Validate Connection
        </button>
      )}
    </motion.div>
  );
}

const defaultTidio: TidioConfig = {
  enabled: false,
  publicKey: "",
  chatControls: "manual",
  chatbotSettings: "",
};

const defaultSocial = {
  schedulerEnabled: false,
  campaignName: "",
  socialSharingEnabled: false,
  platforms: (Object.keys(socialLabels) as SocialPlatformSetting["platform"][]).map((platform): SocialPlatformSetting => ({
    platform,
    enabled: false,
    handle: "",
    url: "",
    analyticsEnabled: false,
  })),
};

export default function AdminIntegrationsPanel({ showToast }: { showToast: (message: string) => void }) {
  const [overview, setOverview] = useState<IntegrationOverview | null>(null);
  const [stripeDashboard, setStripeDashboard] = useState<StripeDashboard | null>(null);
  const [tidio, setTidio] = useState<TidioConfig>(defaultTidio);
  const [social, setSocial] = useState(defaultSocial);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string>("");

  const socialByPlatform = useMemo(() => {
    const map = new Map<SocialPlatformSetting["platform"], SocialPlatformSetting>();
    for (const platform of social.platforms) map.set(platform.platform, platform);
    return map;
  }, [social.platforms]);

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const [overviewData, stripeData, tidioData, socialData] = await Promise.all([
        adminApi.getIntegrationOverview(),
        adminApi.getStripeDashboard(),
        adminApi.getTidioConfig(),
        adminApi.getSocialSettings(),
      ]);
      setOverview(overviewData);
      setStripeDashboard(stripeData);
      setTidio(tidioData);
      setSocial(socialData);
    } catch {
      showToast("Error loading integrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const testProvider = async (provider: string) => {
    setTesting(provider);
    try {
      const result = await adminApi.testIntegration(provider);
      showToast(result.ok ? `${provider} connected` : (result.message || `${provider} needs setup`));
      loadIntegrations();
    } catch {
      showToast(`Error validating ${provider}`);
    } finally {
      setTesting("");
    }
  };

  const saveTidio = async () => {
    try {
      await adminApi.saveTidioConfig(tidio);
      showToast("Tidio settings saved");
      loadIntegrations();
    } catch {
      showToast("Error saving Tidio settings");
    }
  };

  const saveSocial = async () => {
    try {
      await adminApi.saveSocialSettings(social);
      showToast("Social settings saved");
      loadIntegrations();
    } catch {
      showToast("Error saving social settings");
    }
  };

  const updateSocialPlatform = (platform: SocialPlatformSetting["platform"], patch: Partial<SocialPlatformSetting>) => {
    setSocial((current) => ({
      ...current,
      platforms: current.platforms.map((item) => item.platform === platform ? { ...item, ...patch } : item),
    }));
  };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><div className="spinner" /></div>;
  }

  const integrations = overview?.integrations;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>
            Admin-only integrations
          </div>
          <h3 style={{ fontSize: "1.25rem", marginBottom: 8 }}>Integration Control Center</h3>
          <p style={{ color: "var(--text2)", fontSize: "0.9rem", maxWidth: 720 }}>
            Securely manage Shopify, Printify, Stripe, Tidio, and social platform controls from the protected dashboard only.
          </p>
        </div>
        <button type="button" onClick={loadIntegrations} className="btn btn-outline btn-sm">Refresh Status</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {integrations && (
          <>
            <IntegrationCard
              title="Shopify"
              connected={integrations.shopify.connected}
              meta={integrations.shopify.storeUrl || "Store URL and Admin token required"}
              capabilities={integrations.shopify.capabilities}
              onTest={() => testProvider("shopify")}
            />
            <IntegrationCard
              title="Printify"
              connected={integrations.printify.connected}
              meta={integrations.printify.shopId ? `Shop ${integrations.printify.shopId}` : "API key and Shop ID required"}
              capabilities={integrations.printify.capabilities}
              onTest={() => testProvider("printify")}
            />
            <IntegrationCard
              title="Stripe"
              connected={integrations.stripe.connected}
              meta={integrations.stripe.webhookConfigured ? "Payments and webhook configured" : "Payment key or webhook secret missing"}
              capabilities={integrations.stripe.capabilities}
              onTest={() => testProvider("stripe")}
            />
            <IntegrationCard
              title="Tidio AI"
              connected={integrations.tidio.configured}
              meta={integrations.tidio.enabled ? "Chat controls enabled" : "Configure chatbot controls"}
              capabilities={integrations.tidio.capabilities}
              onTest={() => testProvider("tidio")}
            />
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <div style={panelStyle}>
          <h4 style={{ fontSize: "1rem", marginBottom: 12 }}>Stripe Payments</h4>
          <StatusPill active={!!stripeDashboard?.connected} />
          <div style={{ marginTop: 16, color: "var(--text2)", fontSize: "0.85rem" }}>
            <p>Recent payments: {stripeDashboard?.payments?.length ?? 0}</p>
            <p>Recent checkout sessions: {stripeDashboard?.sessions?.length ?? 0}</p>
            <p>Webhook: {stripeDashboard?.webhookConfigured ? "Configured" : "Setup required"}</p>
          </div>
        </div>

        <div style={panelStyle}>
          <h4 style={{ fontSize: "1rem", marginBottom: 12 }}>Tidio Configuration</h4>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text2)", fontSize: "0.85rem" }}>
              <input type="checkbox" checked={tidio.enabled} onChange={(e) => setTidio((current) => ({ ...current, enabled: e.target.checked }))} />
              Enable chatbot controls
            </label>
            <div>
              <label style={labelStyle}>Public Key</label>
              <input style={inputStyle} value={tidio.publicKey} onChange={(e) => setTidio((current) => ({ ...current, publicKey: e.target.value }))} placeholder="Tidio public key" />
            </div>
            <div>
              <label style={labelStyle}>Chat Controls</label>
              <input style={inputStyle} value={tidio.chatControls} onChange={(e) => setTidio((current) => ({ ...current, chatControls: e.target.value }))} placeholder="manual, ai-assisted, off-hours" />
            </div>
            <div>
              <label style={labelStyle}>Chatbot Settings</label>
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={tidio.chatbotSettings} onChange={(e) => setTidio((current) => ({ ...current, chatbotSettings: e.target.value }))} placeholder="Support prompts, routing notes, escalation rules" />
            </div>
            <button type="button" onClick={saveTidio} className="btn btn-primary btn-sm">Save Tidio</button>
          </div>
        </div>
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <h4 style={{ fontSize: "1rem", marginBottom: 8 }}>Social Media Management</h4>
            <p style={{ color: "var(--text2)", fontSize: "0.85rem" }}>Connect account metadata, scheduling, analytics flags, campaigns, and sharing controls.</p>
          </div>
          <button type="button" onClick={saveSocial} className="btn btn-primary btn-sm">Save Social Settings</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 18 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text2)", fontSize: "0.85rem" }}>
            <input type="checkbox" checked={social.schedulerEnabled} onChange={(e) => setSocial((current) => ({ ...current, schedulerEnabled: e.target.checked }))} />
            Content scheduling
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text2)", fontSize: "0.85rem" }}>
            <input type="checkbox" checked={social.socialSharingEnabled} onChange={(e) => setSocial((current) => ({ ...current, socialSharingEnabled: e.target.checked }))} />
            Social sharing controls
          </label>
          <div>
            <label style={labelStyle}>Campaign Name</label>
            <input style={inputStyle} value={social.campaignName} onChange={(e) => setSocial((current) => ({ ...current, campaignName: e.target.value }))} placeholder="Drop campaign / launch name" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {social.platforms.map((platform) => {
            const current = socialByPlatform.get(platform.platform) || platform;
            return (
              <div key={platform.platform} style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <h5 style={{ fontSize: "0.9rem" }}>{socialLabels[platform.platform]}</h5>
                  <StatusPill active={!!current.oauth?.accessTokenConfigured || current.enabled} label={current.enabled ? "Enabled" : "Disabled"} />
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text2)", fontSize: "0.82rem" }}>
                    <input type="checkbox" checked={current.enabled} onChange={(e) => updateSocialPlatform(platform.platform, { enabled: e.target.checked })} />
                    Enable channel
                  </label>
                  <div>
                    <label style={labelStyle}>Handle</label>
                    <input style={inputStyle} value={current.handle} onChange={(e) => updateSocialPlatform(platform.platform, { handle: e.target.value })} placeholder="@buildlevel" />
                  </div>
                  <div>
                    <label style={labelStyle}>Profile URL</label>
                    <input style={inputStyle} value={current.url} onChange={(e) => updateSocialPlatform(platform.platform, { url: e.target.value })} placeholder="https://..." />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text2)", fontSize: "0.82rem" }}>
                    <input type="checkbox" checked={current.analyticsEnabled} onChange={(e) => updateSocialPlatform(platform.platform, { analyticsEnabled: e.target.checked })} />
                    Engagement analytics
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={panelStyle}>
        <h4 style={{ fontSize: "1rem", marginBottom: 12 }}>System Health</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <StatusPill active={!!overview?.system.cloudflarePagesCompatible} label="Cloudflare Pages" />
          <StatusPill active={!!overview?.system.renderApiCompatible} label="Render API" />
          <StatusPill active={!!overview?.system.railwayDatabaseCompatible} label="Railway MySQL" />
          <StatusPill active={overview?.system.publicStorefrontExposure === false} label="Admin-only controls" />
        </div>
      </div>
    </div>
  );
}
