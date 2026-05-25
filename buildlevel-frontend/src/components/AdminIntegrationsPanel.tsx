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

function getPrintifySyncMessage(data: unknown) {
  const summary = data && typeof data === "object" ? (data as Record<string, any>).summary : null;
  if (!summary || typeof summary !== "object") return "";
  return [
    `Printify synced`,
    `${summary.created ?? 0} new`,
    `${summary.updated ?? 0} updated`,
    `${summary.hidden ?? 0} hidden drafts`,
    `${summary.delisted ?? 0} removed`,
  ].join(" · ");
}

function IntegrationCard({
  title,
  connected,
  disabled,
  meta,
  capabilities,
  onTest,
  onDisconnect,
  onEnable,
}: {
  title: string;
  connected: boolean;
  disabled?: boolean;
  meta: string;
  capabilities: string[];
  onTest?: () => void;
  onDisconnect?: () => void;
  onEnable?: () => void;
}) {
  return (
    <motion.div
      style={panelStyle}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 180px" }}>
          <h4 style={{ fontSize: "0.95rem", marginBottom: 6 }}>{title}</h4>
          <p style={{ color: "var(--text2)", fontSize: "0.8rem", overflowWrap: "anywhere", wordBreak: "break-word" }}>{meta}</p>
        </div>
        <div style={{ flex: "0 0 auto", maxWidth: "100%" }}>
          <StatusPill active={!disabled && connected} label={disabled ? "Disconnected" : undefined} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {capabilities.map((capability) => (
          <span key={capability} className="badge badge-dark">{capability}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onTest && (
          <button type="button" onClick={onTest} className="btn btn-outline btn-sm" disabled={disabled}>
            Validate Connection
          </button>
        )}
        {disabled && onEnable ? (
          <button type="button" onClick={onEnable} className="btn btn-primary btn-sm">
            Enable
          </button>
        ) : onDisconnect ? (
          <button type="button" onClick={onDisconnect} className="btn btn-outline btn-sm" style={{ borderColor: "rgba(192,57,43,0.65)", color: "#ffb4aa" }}>
            Disconnect
          </button>
        ) : null}
      </div>
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
  const [shopifyCredentials, setShopifyCredentials] = useState({ storeUrl: "", apiKey: "" });
  const [printifyCredentials, setPrintifyCredentials] = useState({ apiKey: "", shopId: "" });
  const [shopifySnapshot, setShopifySnapshot] = useState<Record<string, unknown>>({});
  const [printifySnapshot, setPrintifySnapshot] = useState<Record<string, unknown>>({});
  const [printifyProducts, setPrintifyProducts] = useState<Array<{ id: string; title?: string; visible?: boolean; is_locked?: boolean }>>([]);
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
      setShopifyCredentials((current) => ({ ...current, storeUrl: overviewData.integrations.shopify.storeUrl || current.storeUrl }));
      setPrintifyCredentials((current) => ({ ...current, shopId: overviewData.integrations.printify.shopId || current.shopId }));
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

  const disconnectProvider = async (provider: "shopify" | "printify" | "stripe" | "tidio" | "social") => {
    const label = provider === "tidio" ? "Tidio" : provider.charAt(0).toUpperCase() + provider.slice(1);
    const confirmed = window.confirm(`Disconnect ${label}? This will disable the integration immediately. You can reconnect it later.`);
    if (!confirmed) return;
    setTesting(`disconnect-${provider}`);
    try {
      await adminApi.disconnectIntegration(provider);
      if (provider === "shopify") setShopifyCredentials({ storeUrl: "", apiKey: "" });
      if (provider === "printify") setPrintifyCredentials({ apiKey: "", shopId: "" });
      if (provider === "tidio") setTidio(defaultTidio);
      showToast(`${label} disconnected`);
      loadIntegrations();
    } catch (error: any) {
      showToast(error?.response?.data?.error || `Error disconnecting ${label}`);
    } finally {
      setTesting("");
    }
  };

  const enableProvider = async (provider: "stripe" | "tidio") => {
    const label = provider === "tidio" ? "Tidio" : provider.charAt(0).toUpperCase() + provider.slice(1);
    setTesting(`enable-${provider}`);
    try {
      await adminApi.enableIntegration(provider);
      showToast(`${label} enabled`);
      loadIntegrations();
    } catch (error: any) {
      showToast(error?.response?.data?.error || `Error enabling ${label}`);
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

  const saveShopify = async () => {
    try {
      await adminApi.saveShopifyCredentials(shopifyCredentials);
      showToast("Shopify credentials saved");
      loadIntegrations();
    } catch {
      showToast("Error saving Shopify credentials");
    }
  };

  const savePrintify = async () => {
    if (/^https?:\/\//i.test(printifyCredentials.apiKey.trim())) {
      showToast("Paste your Printify API token, not the API address");
      return;
    }
    if (!printifyCredentials.apiKey.trim() || !printifyCredentials.shopId.trim()) {
      showToast("Printify API token and Shop ID are required");
      return;
    }
    try {
      await adminApi.savePrintifyCredentials(printifyCredentials);
      showToast("Printify credentials saved");
      loadIntegrations();
    } catch {
      showToast("Error saving Printify credentials");
    }
  };

  const runShopifyAction = async (action: "products" | "orders" | "customers" | "inventory" | "webhooks" | "sync") => {
    setTesting(`shopify-${action}`);
    try {
      const data =
        action === "products" ? await adminApi.getShopifyProducts() :
        action === "orders" ? await adminApi.getShopifyOrders() :
        action === "customers" ? await adminApi.getShopifyCustomers() :
        action === "inventory" ? await adminApi.getShopifyInventory() :
        action === "webhooks" ? await adminApi.getShopifyWebhooks() :
        await adminApi.syncShopify();
      setShopifySnapshot((current) => ({ ...current, [action]: data }));
      showToast(`Shopify ${action} loaded`);
    } catch {
      showToast(`Shopify ${action} needs configuration`);
    } finally {
      setTesting("");
    }
  };

  const runPrintifyAction = async (action: "products" | "orders" | "inventory" | "sync") => {
    setTesting(`printify-${action}`);
    try {
      const data =
        action === "products" ? await adminApi.getPrintifyProducts() :
        action === "orders" ? await adminApi.getPrintifyOrders() :
        action === "inventory" ? await adminApi.getPrintifyInventory() :
        await adminApi.syncPrintify();
      setPrintifySnapshot((current) => ({ ...current, [action]: data }));
      if (action === "products" && data && typeof data === "object" && Array.isArray((data as any).data)) {
        setPrintifyProducts((data as any).data);
      }
      const syncProducts = (data as { products?: unknown })?.products;
      if (action === "sync" && syncProducts && typeof syncProducts === "object" && Array.isArray((syncProducts as any).data)) {
        setPrintifyProducts((syncProducts as any).data);
      }
      showToast(action === "sync" ? getPrintifySyncMessage(data) || "Printify store synced" : `Printify ${action} loaded`);
    } catch (error: any) {
      showToast(error?.response?.data?.error || `Printify ${action} needs configuration`);
    } finally {
      setTesting("");
    }
  };

  const publishPrintify = async (printifyProductId?: string) => {
    printifyProductId = printifyProductId || prompt("Printify product ID to publish") || "";
    if (!printifyProductId) return;
    setTesting("printify-publish");
    try {
      const result = await adminApi.publishPrintifyProduct(printifyProductId);
      showToast(result.success ? "Printify product published to website" : "Printify publish failed");
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Printify publish needs configuration");
    } finally {
      setTesting("");
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

  const countRecords = (data: unknown, keys: string[]) => {
    if (!data || typeof data !== "object") return 0;
    for (const key of keys) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value.length;
      if (value && typeof value === "object") {
        const nested = (value as Record<string, unknown>).data;
        if (Array.isArray(nested)) return nested.length;
      }
    }
    const summary = (data as Record<string, unknown>).summary;
    if (summary && typeof summary === "object") {
      return Object.values(summary as Record<string, unknown>).reduce<number>((total, value) => total + (typeof value === "number" ? value : 0), 0);
    }
    return 0;
  };

  const countSnapshotRecords = (snapshot: Record<string, unknown>, keys: string[]) =>
    Object.values(snapshot).reduce<number>((total, data) => total + countRecords(data, keys), 0);

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
              disabled={integrations.shopify.disabled}
              meta={integrations.shopify.disabled ? "Disconnected by admin" : integrations.shopify.storeUrl || "Store URL and Admin token required"}
              capabilities={integrations.shopify.capabilities}
              onTest={() => testProvider("shopify")}
              onDisconnect={() => disconnectProvider("shopify")}
            />
            <IntegrationCard
              title="Printify"
              connected={integrations.printify.connected}
              disabled={integrations.printify.disabled}
              meta={integrations.printify.disabled ? "Disconnected by admin" : integrations.printify.shopId ? `Shop ${integrations.printify.shopId}` : "API key and Shop ID required"}
              capabilities={integrations.printify.capabilities}
              onTest={() => testProvider("printify")}
              onDisconnect={() => disconnectProvider("printify")}
            />
            <IntegrationCard
              title="Stripe"
              connected={integrations.stripe.connected}
              disabled={integrations.stripe.disabled}
              meta={integrations.stripe.disabled ? "Checkout disconnected by admin" : integrations.stripe.webhookConfigured ? "Payments and webhook configured" : "Payment key or webhook secret missing"}
              capabilities={integrations.stripe.capabilities}
              onTest={() => testProvider("stripe")}
              onDisconnect={() => disconnectProvider("stripe")}
              onEnable={() => enableProvider("stripe")}
            />
            <IntegrationCard
              title="Tidio AI"
              connected={integrations.tidio.configured}
              disabled={integrations.tidio.disabled}
              meta={integrations.tidio.disabled ? "Disconnected by admin" : integrations.tidio.enabled ? "Chat controls enabled" : "Configure chatbot controls"}
              capabilities={integrations.tidio.capabilities}
              onTest={() => testProvider("tidio")}
              onDisconnect={() => disconnectProvider("tidio")}
              onEnable={() => enableProvider("tidio")}
            />
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <div style={panelStyle}>
          <h4 style={{ fontSize: "1rem", marginBottom: 12 }}>Shopify Management</h4>
          <p style={{ color: "var(--text2)", fontSize: "0.84rem", marginBottom: 14 }}>
            Save Admin API credentials, validate connection, and sync products, inventory, orders, customers, and webhooks.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>Store URL</label>
              <input style={inputStyle} value={shopifyCredentials.storeUrl} onChange={(e) => setShopifyCredentials((current) => ({ ...current, storeUrl: e.target.value }))} placeholder="your-store.myshopify.com" />
            </div>
            <div>
              <label style={labelStyle}>Admin Access Token</label>
              <input style={inputStyle} type="password" value={shopifyCredentials.apiKey} onChange={(e) => setShopifyCredentials((current) => ({ ...current, apiKey: e.target.value }))} placeholder="shpat_..." />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={saveShopify} className="btn btn-primary btn-sm">
                {integrations?.shopify.disabled ? "Reconnect Shopify" : "Save Shopify"}
              </button>
              <button type="button" onClick={() => testProvider("shopify")} className="btn btn-outline btn-sm">Validate</button>
            </div>
            {integrations?.shopify.disabled && (
              <p style={{ color: "var(--text3)", fontSize: "0.74rem" }}>
                Reconnect requires re-entering the Store URL and Admin Access Token.
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["products", "inventory", "orders", "customers", "webhooks", "sync"] as const).map((action) => (
                <button key={action} type="button" onClick={() => runShopifyAction(action)} className="btn btn-outline btn-sm" disabled={testing === `shopify-${action}`}>
                  {action}
                </button>
              ))}
            </div>
            <p style={{ color: "var(--text2)", fontSize: "0.78rem" }}>
              Loaded records: {countSnapshotRecords(shopifySnapshot, ["products", "orders", "customers", "webhooks"])}
            </p>
          </div>
        </div>

        <div style={panelStyle}>
          <h4 style={{ fontSize: "1rem", marginBottom: 12 }}>Printify Management</h4>
          <p style={{ color: "var(--text2)", fontSize: "0.84rem", marginBottom: 14 }}>
            Save API credentials, sync products/orders/inventory, and trigger product publishing/fulfillment workflows.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>API Token</label>
              <input style={inputStyle} type="password" value={printifyCredentials.apiKey} onChange={(e) => setPrintifyCredentials((current) => ({ ...current, apiKey: e.target.value }))} placeholder="Printify API token" />
              <p style={{ color: "var(--text3)", fontSize: "0.74rem", marginTop: 6 }}>
                Paste the token from Printify Account Settings → API Tokens. Do not paste https://api.printify.com.
              </p>
            </div>
            <div>
              <label style={labelStyle}>Shop ID</label>
              <input style={inputStyle} value={printifyCredentials.shopId} onChange={(e) => setPrintifyCredentials((current) => ({ ...current, shopId: e.target.value }))} placeholder="Printify shop ID" />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={savePrintify} className="btn btn-primary btn-sm">
                {integrations?.printify.disabled ? "Reconnect Printify" : "Save Printify"}
              </button>
              <button type="button" onClick={() => testProvider("printify")} className="btn btn-outline btn-sm">Validate</button>
              <button type="button" onClick={() => publishPrintify()} className="btn btn-outline btn-sm" disabled={testing === "printify-publish"}>Publish to Website</button>
            </div>
            {integrations?.printify.disabled && (
              <p style={{ color: "var(--text3)", fontSize: "0.74rem" }}>
                Reconnect requires re-entering the Printify API Token and Shop ID.
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["products", "inventory", "orders", "sync"] as const).map((action) => (
                <button key={action} type="button" onClick={() => runPrintifyAction(action)} className="btn btn-outline btn-sm" disabled={testing === `printify-${action}`}>
                  {action}
                </button>
              ))}
            </div>
            {printifyProducts.length > 0 && (
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                <div style={{ color: "var(--text2)", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Printify Products
                </div>
                {printifyProducts.slice(0, 8).map(product => (
                  <div key={product.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "rgba(255,255,255,0.025)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "var(--text)", fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.title || product.id}</div>
                      <div style={{ color: "var(--text3)", fontSize: "0.7rem" }}>{product.visible ? "Visible" : "Draft"} · {product.is_locked ? "Locked" : "Editable"}</div>
                    </div>
                    <button type="button" onClick={() => publishPrintify(product.id)} className="btn btn-outline btn-sm" disabled={testing === "printify-publish"}>
                      Publish to Website
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p style={{ color: "var(--text2)", fontSize: "0.78rem" }}>
              Loaded records: {countSnapshotRecords(printifySnapshot, ["data", "products", "orders"])}
            </p>
            {printifySnapshot.sync && (
              <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>
                {getPrintifySyncMessage(printifySnapshot.sync)}
              </p>
            )}
          </div>
        </div>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={saveSocial} className="btn btn-primary btn-sm">Save Social Settings</button>
            <button type="button" onClick={() => disconnectProvider("social")} className="btn btn-outline btn-sm" style={{ borderColor: "rgba(192,57,43,0.65)", color: "#ffb4aa" }}>
              Disconnect Social
            </button>
          </div>
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
