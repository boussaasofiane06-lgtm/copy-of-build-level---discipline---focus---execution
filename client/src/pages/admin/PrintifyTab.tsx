/* ==========================================================================
   BUILD LEVEL — Admin: Printify Integration Tab
   ========================================================================== */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Download, Package, Loader2, ChevronLeft, ChevronRight, Eye } from "lucide-react";

export default function PrintifyTab() {
  const [apiKey, setApiKey] = useState("");
  const [shopId, setShopId] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [activeView, setActiveView] = useState<"products" | "orders">("products");
  const [productPage, setProductPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [importingId, setImportingId] = useState<string | null>(null);

  const { data: status, refetch: refetchStatus } = trpc.integrations.getPrintifyStatus.useQuery();
  const { data: productsData, isLoading: productsLoading, refetch: refetchProducts } = trpc.integrations.listPrintifyProducts.useQuery(
    { page: productPage },
    { enabled: status?.connected === true && activeView === "products", retry: false }
  );
  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = trpc.integrations.listPrintifyOrders.useQuery(
    { page: orderPage },
    { enabled: status?.connected === true && activeView === "orders", retry: false }
  );

  const saveCreds = trpc.integrations.savePrintifyCredentials.useMutation({
    onSuccess: () => { toast.success("Printify connected!"); refetchStatus(); setApiKey(""); setShopId(""); },
    onError: (e) => toast.error(e.message),
  });

  const importProduct = trpc.integrations.importPrintifyProduct.useMutation({
    onSuccess: (data) => {
      if (data.alreadyExists) toast.info("Product already imported");
      else toast.success("Product imported! Go to Products tab to publish it.");
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => setImportingId(null),
  });

  const handleSaveCreds = async () => {
    if (!apiKey.trim() || !shopId.trim()) { toast.error("Both API Key and Shop ID are required"); return; }
    setSavingCreds(true);
    try { await saveCreds.mutateAsync({ apiKey: apiKey.trim(), shopId: shopId.trim() }); }
    finally { setSavingCreds(false); }
  };

  const handleImport = (id: string) => {
    setImportingId(id);
    importProduct.mutate({ printifyProductId: id });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-white font-bold tracking-widest text-lg">PRINTIFY</h1>
          <p className="font-body text-[#555] text-sm mt-1">Print-on-demand fulfillment — sync products and manage orders.</p>
        </div>
        <a href="https://printify.com/app/account/api" target="_blank" rel="noopener noreferrer"
          className="admin-btn-secondary flex items-center gap-1.5 text-xs">
          <ExternalLink size={11} /> Printify Dashboard
        </a>
      </div>

      {/* Connection Setup */}
      {!status?.connected && (
        <div className="bg-[#1A1A1A] border border-white/10 p-6 mb-6">
          <h2 className="font-display text-white font-bold tracking-widest text-sm mb-4">CONNECT PRINTIFY</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1.5">API KEY</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Paste your Printify API key"
                  className="w-full bg-[#111] border border-white/10 text-white font-body text-xs px-3 py-2.5 pr-16 outline-none focus:border-[#FF6B00]"
                />
                <button type="button" onClick={() => setShowKey(s => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-white text-[10px] font-display tracking-widest">
                  {showKey ? "HIDE" : "SHOW"}
                </button>
              </div>
            </div>
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1.5">SHOP ID</label>
              <input
                type="text"
                value={shopId}
                onChange={e => setShopId(e.target.value)}
                placeholder="Your Printify Shop ID"
                className="w-full bg-[#111] border border-white/10 text-white font-body text-xs px-3 py-2.5 outline-none focus:border-[#FF6B00]"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveCreds} disabled={savingCreds}
              className="admin-btn-primary flex items-center gap-2 text-xs">
              {savingCreds ? <Loader2 size={12} className="animate-spin" /> : null}
              CONNECT PRINTIFY
            </button>
            <p className="font-body text-[#555] text-xs">
              Get your API key from <a href="https://printify.com/app/account/api" target="_blank" className="text-[#FF6B00] hover:underline">printify.com/app/account/api</a>
            </p>
          </div>
        </div>
      )}

      {/* Connected State */}
      {status?.connected && (
        <>
          {/* Status Bar */}
          <div className="bg-[#1A1A1A] border border-green-500/20 p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="font-display text-green-400 text-xs tracking-widest">PRINTIFY CONNECTED</span>
            </div>
            <button onClick={() => { setApiKey(""); setShopId(""); }}
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
              {!productsLoading && productsData && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {productsData.products.map((p: any) => (
                      <div key={p.id} className="bg-[#1A1A1A] border border-white/10 overflow-hidden">
                        {p.images[0] && (
                          <img src={p.images[0]} alt={p.title} className="w-full h-40 object-cover" />
                        )}
                        {!p.images[0] && (
                          <div className="w-full h-40 bg-[#222] flex items-center justify-center">
                            <Package size={32} className="text-[#333]" />
                          </div>
                        )}
                        <div className="p-4">
                          <p className="font-display text-white text-xs font-bold tracking-wider mb-1 line-clamp-2">{p.title}</p>
                          <p className="font-body text-[#555] text-xs mb-1">{p.variants.length} variants</p>
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
                            <a href={`https://printify.com/app/products/${p.id}`} target="_blank" rel="noopener noreferrer"
                              className="admin-btn-secondary flex items-center gap-1.5 text-xs px-3">
                              <Eye size={11} />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between">
                    <span className="font-body text-[#555] text-xs">{productsData.total} total products</span>
                    <div className="flex gap-2">
                      <button onClick={() => setProductPage(p => Math.max(1, p - 1))} disabled={productPage === 1}
                        className="admin-btn-secondary flex items-center gap-1 text-xs px-3 disabled:opacity-40">
                        <ChevronLeft size={12} /> Prev
                      </button>
                      <span className="font-display text-[#555] text-xs px-3 py-2">
                        {productPage} / {productsData.lastPage}
                      </span>
                      <button onClick={() => setProductPage(p => p + 1)} disabled={productPage >= productsData.lastPage}
                        className="admin-btn-secondary flex items-center gap-1 text-xs px-3 disabled:opacity-40">
                        Next <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Orders View */}
          {activeView === "orders" && (
            <div>
              {ordersLoading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-[#FF6B00]" />
                </div>
              )}
              {!ordersLoading && ordersData && (
                <div className="space-y-3">
                  {ordersData.orders.length === 0 && (
                    <div className="text-center py-12">
                      <Package size={40} className="text-[#333] mx-auto mb-3" />
                      <p className="font-body text-[#555] text-sm">No orders yet</p>
                    </div>
                  )}
                  {ordersData.orders.map((o: any) => (
                    <div key={o.id} className="bg-[#1A1A1A] border border-white/10 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-display text-white text-xs font-bold tracking-wider">#{o.id.slice(-8).toUpperCase()}</p>
                          <p className="font-body text-[#666] text-xs mt-0.5">{o.addressTo.name} — {o.addressTo.country}</p>
                          <p className="font-body text-[#555] text-xs mt-1">
                            {o.lineItems.map((li: any) => `${li.quantity}x ${li.title}`).join(", ")}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-display text-white text-sm font-bold">${o.totalPrice.toFixed(2)}</p>
                          <span className={`inline-block mt-1 px-2 py-0.5 font-display text-[10px] tracking-widest ${
                            o.status === "fulfilled" ? "bg-green-500/10 text-green-400" :
                            o.status === "pending" ? "bg-yellow-500/10 text-yellow-400" :
                            "bg-white/5 text-[#555]"
                          }`}>
                            {o.status.toUpperCase()}
                          </span>
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
