/* ==========================================================================
   BUILD LEVEL — Admin: Shopify Integration Tab
   ========================================================================== */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Download, Package, Loader2, ShoppingBag, Eye } from "lucide-react";

export default function ShopifyTab() {
  const [storeUrl, setStoreUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [activeView, setActiveView] = useState<"products" | "orders">("products");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState("any");

  const { data: status, refetch: refetchStatus } = trpc.integrations.getShopifyStatus.useQuery();
  const { data: shopifyProducts, isLoading: productsLoading, refetch: refetchProducts } = trpc.integrations.listShopifyProducts.useQuery(
    { limit: 20 },
    { enabled: status?.connected === true && activeView === "products", retry: false }
  );
  const { data: shopifyOrders, isLoading: ordersLoading, refetch: refetchOrders } = trpc.integrations.listShopifyOrders.useQuery(
    { limit: 20, status: orderStatus },
    { enabled: status?.connected === true && activeView === "orders", retry: false }
  );

  const saveCreds = trpc.integrations.saveShopifyCredentials.useMutation({
    onSuccess: () => { toast.success("Shopify connected!"); refetchStatus(); setStoreUrl(""); setApiKey(""); },
    onError: (e) => toast.error(e.message),
  });

  const importProduct = trpc.integrations.importShopifyProduct.useMutation({
    onSuccess: (data) => {
      if (data.alreadyExists) toast.info("Product already imported");
      else toast.success("Product imported! Go to Products tab to publish it.");
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setImportingId(null),
  });

  const handleSaveCreds = async () => {
    if (!storeUrl.trim() || !apiKey.trim()) { toast.error("Both Store URL and API Key are required"); return; }
    setSavingCreds(true);
    try { await saveCreds.mutateAsync({ storeUrl: storeUrl.trim(), apiKey: apiKey.trim() }); }
    finally { setSavingCreds(false); }
  };

  const handleImport = (id: string) => {
    setImportingId(id);
    importProduct.mutate({ shopifyProductId: id });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-white font-bold tracking-widest text-lg">SHOPIFY</h1>
          <p className="font-body text-[#555] text-sm mt-1">Sync products and orders from your Shopify store.</p>
        </div>
        {status?.storeUrl && (
          <a href={`https://${status.storeUrl.replace(/^https?:\/\//, "")}/admin`} target="_blank" rel="noopener noreferrer"
            className="admin-btn-secondary flex items-center gap-1.5 text-xs">
            <ExternalLink size={11} /> Shopify Admin
          </a>
        )}
      </div>

      {/* Connection Setup */}
      {!status?.connected && (
        <div className="bg-[#1A1A1A] border border-white/10 p-6 mb-6">
          <h2 className="font-display text-white font-bold tracking-widest text-sm mb-4">CONNECT SHOPIFY</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1.5">STORE URL</label>
              <input
                type="text"
                value={storeUrl}
                onChange={e => setStoreUrl(e.target.value)}
                placeholder="your-store.myshopify.com"
                className="w-full bg-[#111] border border-white/10 text-white font-body text-xs px-3 py-2.5 outline-none focus:border-[#FF6B00]"
              />
            </div>
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1.5">ADMIN API ACCESS TOKEN</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="shpat_xxxxxxxxxxxxxxxx"
                  className="w-full bg-[#111] border border-white/10 text-white font-body text-xs px-3 py-2.5 pr-16 outline-none focus:border-[#FF6B00]"
                />
                <button type="button" onClick={() => setShowKey(s => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-white text-[10px] font-display tracking-widest">
                  {showKey ? "HIDE" : "SHOW"}
                </button>
              </div>
            </div>
          </div>
          <div className="bg-[#111] border border-white/5 p-3 mb-4">
            <p className="font-body text-[#666] text-xs leading-relaxed">
              <strong className="text-[#888]">How to get your API token:</strong> Shopify Admin → Settings → Apps → Develop apps → Create an app → Configure Admin API scopes (read_products, read_orders) → Install app → Copy Admin API access token.
            </p>
          </div>
          <button onClick={handleSaveCreds} disabled={savingCreds}
            className="admin-btn-primary flex items-center gap-2 text-xs">
            {savingCreds ? <Loader2 size={12} className="animate-spin" /> : null}
            CONNECT SHOPIFY
          </button>
        </div>
      )}

      {/* Connected State */}
      {status?.connected && (
        <>
          {/* Status Bar */}
          <div className="bg-[#1A1A1A] border border-green-500/20 p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <div>
                <span className="font-display text-green-400 text-xs tracking-widest">SHOPIFY CONNECTED</span>
                {status.storeUrl && (
                  <p className="font-body text-[#555] text-xs mt-0.5">{status.storeUrl}</p>
                )}
              </div>
            </div>
            <button onClick={() => { setStoreUrl(""); setApiKey(""); }}
              className="admin-btn-danger text-xs px-3 py-1.5">
              DISCONNECT
            </button>
          </div>

          {/* View Tabs */}
          <div className="flex gap-0 border-b border-white/10 mb-6">
            {[
              { id: "products", label: "PRODUCTS" },
              { id: "orders", label: "ORDERS" },
            ].map(({ id, label }) => (
              <button key={id} onClick={() => setActiveView(id as any)}
                className={`px-5 py-3 font-display text-xs font-bold tracking-widest border-b-2 transition-colors ${
                  activeView === id ? "border-[#FF6B00] text-white" : "border-transparent text-[#555] hover:text-[#888]"
                }`}>
                {label}
              </button>
            ))}
            <button onClick={() => activeView === "products" ? refetchProducts() : refetchOrders()}
              className="ml-auto admin-btn-secondary flex items-center gap-1.5 text-xs mb-1">
              <RefreshCw size={11} /> Refresh
            </button>
          </div>

          {/* Products View */}
          {activeView === "products" && (
            <div>
              {productsLoading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-[#FF6B00]" />
                </div>
              )}
              {!productsLoading && shopifyProducts && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {shopifyProducts.length === 0 && (
                    <div className="col-span-3 text-center py-12">
                      <Package size={40} className="text-[#333] mx-auto mb-3" />
                      <p className="font-body text-[#555] text-sm">No active products found</p>
                    </div>
                  )}
                  {(shopifyProducts as any[]).map((p) => (
                    <div key={p.id} className="bg-[#1A1A1A] border border-white/10 overflow-hidden">
                      {p.images[0] && (
                        <img src={p.images[0]} alt={p.title} className="w-full h-40 object-cover" />
                      )}
                      {!p.images[0] && (
                        <div className="w-full h-40 bg-[#222] flex items-center justify-center">
                          <ShoppingBag size={32} className="text-[#333]" />
                        </div>
                      )}
                      <div className="p-4">
                        <p className="font-display text-white text-xs font-bold tracking-wider mb-1 line-clamp-2">{p.title}</p>
                        {p.vendor && <p className="font-body text-[#555] text-xs mb-1">{p.vendor}</p>}
                        <p className="font-body text-[#888] text-xs mb-1">{p.variants.length} variants</p>
                        {p.variants[0] && (
                          <p className="font-body text-[#888] text-xs mb-3">From ${p.variants[0].price.toFixed(2)}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleImport(p.id)}
                            disabled={importingId === p.id}
                            className="admin-btn-primary flex items-center gap-1.5 text-xs flex-1 justify-center"
                          >
                            {importingId === p.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                            IMPORT
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Orders View */}
          {activeView === "orders" && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <label className="font-display text-[#888] text-[10px] tracking-widest">STATUS:</label>
                <select value={orderStatus} onChange={e => setOrderStatus(e.target.value)}
                  className="bg-[#1A1A1A] border border-white/10 text-white font-body text-xs px-3 py-1.5 outline-none">
                  <option value="any">All</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {ordersLoading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-[#FF6B00]" />
                </div>
              )}
              {!ordersLoading && shopifyOrders && (
                <div className="space-y-3">
                  {(shopifyOrders as any[]).length === 0 && (
                    <div className="text-center py-12">
                      <ShoppingBag size={40} className="text-[#333] mx-auto mb-3" />
                      <p className="font-body text-[#555] text-sm">No orders found</p>
                    </div>
                  )}
                  {(shopifyOrders as any[]).map((o) => (
                    <div key={o.id} className="bg-[#1A1A1A] border border-white/10 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <p className="font-display text-white text-xs font-bold tracking-wider">{o.name}</p>
                            <span className={`px-2 py-0.5 font-display text-[10px] tracking-widest ${
                              o.financialStatus === "paid" ? "bg-green-500/10 text-green-400" :
                              o.financialStatus === "pending" ? "bg-yellow-500/10 text-yellow-400" :
                              "bg-white/5 text-[#555]"
                            }`}>
                              {o.financialStatus?.toUpperCase()}
                            </span>
                            <span className={`px-2 py-0.5 font-display text-[10px] tracking-widest ${
                              o.fulfillmentStatus === "fulfilled" ? "bg-blue-500/10 text-blue-400" :
                              "bg-white/5 text-[#555]"
                            }`}>
                              {o.fulfillmentStatus?.toUpperCase()}
                            </span>
                          </div>
                          <p className="font-body text-[#666] text-xs">{o.customer.name} — {o.customer.email}</p>
                          <p className="font-body text-[#555] text-xs mt-1">
                            {o.lineItems.map((li: any) => `${li.quantity}x ${li.title}`).join(", ")}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-display text-white text-sm font-bold">${o.totalPrice.toFixed(2)} {o.currency}</p>
                          <p className="font-body text-[#555] text-[10px] mt-1">
                            {new Date(o.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
