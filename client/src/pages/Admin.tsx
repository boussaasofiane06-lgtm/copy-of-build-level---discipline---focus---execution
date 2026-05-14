/* ==========================================================================
   BUILD LEVEL — Admin Panel
   Private dashboard for managing products, prices, and site settings
   Only accessible to admin users (role = 'admin')
   ========================================================================== */

import { useState, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Plus, Pencil, Trash2, Upload, Save, X, Package, Settings,
  ShoppingBag, ToggleLeft, ToggleRight, Star, StarOff, ChevronLeft,
  Loader2, Image as ImageIcon, ExternalLink
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductFormData {
  name: string;
  description: string;
  price: string;
  compareAtPrice: string;
  category: string;
  sizes: string;
  badge: string;
  inStock: boolean;
  featured: boolean;
  sortOrder: string;
  shopifyVariantId: string;
  shopifyProductId: string;
  printifyProductId: string;
  imageUrl: string;
}

const EMPTY_FORM: ProductFormData = {
  name: "", description: "", price: "", compareAtPrice: "",
  category: "hoodies", sizes: "S,M,L,XL,XXL", badge: "",
  inStock: true, featured: false, sortOrder: "0",
  shopifyVariantId: "", shopifyProductId: "", printifyProductId: "", imageUrl: "",
};

const CATEGORIES = ["hoodies", "t-shirts", "hats", "accessories", "apparel"];

// ─── Password Login ──────────────────────────────────────────────────────────

function AdminPasswordLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        setError("Incorrect password. Try again.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111] flex flex-col items-center justify-center gap-6 px-4">
      <div className="font-display text-2xl font-bold tracking-[0.15em] text-white">
        BUILD<span className="text-[#FF6B00]"> LEVEL</span>
      </div>
      <p className="font-display text-white text-xl tracking-widest">ADMIN ACCESS</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-[320px]">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter admin password"
          className="bg-[#1A1A1A] border border-white/10 text-white font-body text-sm px-4 py-3 outline-none focus:border-[#FF6B00] transition-colors w-full"
          autoFocus
        />
        {error && <p className="text-red-400 text-xs font-body">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="bg-[#FF6B00] text-white font-display text-sm tracking-widest px-8 py-3 hover:bg-[#e55e00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : null}
          {loading ? "VERIFYING..." : "LOG IN"}
        </button>
      </form>
      <Link href="/" className="font-display text-xs text-[#555] tracking-wider hover:text-white transition-colors">
        BACK TO SITE
      </Link>
    </div>
  );
}

// ─── Admin Guard ──────────────────────────────────────────────────────────────

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#FF6B00]" size={32} />
      </div>
    );
  }

  if (!user) {
    return <AdminPasswordLogin onSuccess={() => window.location.reload()} />;
  }

  if (user.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#111] flex flex-col items-center justify-center gap-4">
        <p className="font-display text-white text-xl tracking-widest">ACCESS DENIED</p>
        <p className="font-body text-[#888] text-sm">You don't have admin privileges.</p>
        <Link href="/" className="font-display text-xs text-[#FF6B00] tracking-wider border border-[#FF6B00] px-4 py-2 hover:bg-[#FF6B00] hover:text-white transition-colors">
          BACK TO SITE
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

// ─── Product Form Modal ───────────────────────────────────────────────────────

function ProductModal({
  initial,
  onClose,
  onSave,
  isLoading,
}: {
  initial: ProductFormData & { id?: number };
  onClose: () => void;
  onSave: (data: ProductFormData & { id?: number }) => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadImage = trpc.admin.uploadProductImage.useMutation({
    onSuccess: (data) => {
      setForm((f) => ({ ...f, imageUrl: data.url }));
      toast.success("Image uploaded");
    },
    onError: () => toast.error("Image upload failed"),
  });

  const set = (k: keyof ProductFormData, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadImage.mutate({ base64, filename: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[#1A1A1A] border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-display text-white font-bold tracking-widest text-sm">
            {form.id ? "EDIT PRODUCT" : "ADD PRODUCT"}
          </h2>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Product Image */}
          <div className="md:col-span-2">
            <label className="admin-label">Product Image</label>
            <div className="flex items-start gap-4">
              <div className="w-24 h-24 bg-[#2A2A2A] border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="Product" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={24} className="text-[#444]" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  className="hidden"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadImage.isPending}
                  className="admin-btn-secondary flex items-center gap-2 text-xs"
                >
                  {uploadImage.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {uploadImage.isPending ? "Uploading..." : "Upload Image"}
                </button>
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => set("imageUrl", e.target.value)}
                  placeholder="Or paste image URL"
                  className="admin-input text-xs"
                />
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="md:col-span-2">
            <label className="admin-label">Product Name *</label>
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} className="admin-input" placeholder="e.g. DISCIPLINE HOODIE" />
          </div>

          {/* Description */}
          <div className="md:col-span-2">
            <label className="admin-label">Description</label>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} className="admin-input resize-none h-20" placeholder="Product description..." />
          </div>

          {/* Price */}
          <div>
            <label className="admin-label">Price (USD) *</label>
            <input type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} className="admin-input" placeholder="65.00" />
          </div>

          {/* Compare at Price */}
          <div>
            <label className="admin-label">Compare-at Price (optional)</label>
            <input type="number" step="0.01" value={form.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} className="admin-input" placeholder="80.00" />
          </div>

          {/* Category */}
          <div>
            <label className="admin-label">Category</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className="admin-input">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Badge */}
          <div>
            <label className="admin-label">Badge (optional)</label>
            <input type="text" value={form.badge} onChange={(e) => set("badge", e.target.value)} className="admin-input" placeholder="e.g. NEW, BESTSELLER, SALE" />
          </div>

          {/* Sizes */}
          <div className="md:col-span-2">
            <label className="admin-label">Available Sizes (comma-separated)</label>
            <input type="text" value={form.sizes} onChange={(e) => set("sizes", e.target.value)} className="admin-input" placeholder="S,M,L,XL,XXL" />
          </div>

          {/* Sort Order */}
          <div>
            <label className="admin-label">Sort Order</label>
            <input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} className="admin-input" placeholder="0" />
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6 pt-2">
            <button onClick={() => set("inStock", !form.inStock)} className="flex items-center gap-2 text-xs font-body">
              {form.inStock ? <ToggleRight size={20} className="text-green-400" /> : <ToggleLeft size={20} className="text-[#555]" />}
              <span className={form.inStock ? "text-green-400" : "text-[#555]"}>In Stock</span>
            </button>
            <button onClick={() => set("featured", !form.featured)} className="flex items-center gap-2 text-xs font-body">
              {form.featured ? <Star size={16} className="text-[#FF6B00]" fill="#FF6B00" /> : <StarOff size={16} className="text-[#555]" />}
              <span className={form.featured ? "text-[#FF6B00]" : "text-[#555]"}>Featured</span>
            </button>
          </div>

          {/* Third-party IDs */}
          <div className="md:col-span-2 border-t border-white/5 pt-4">
            <p className="font-display text-[10px] text-[#555] tracking-widest mb-3">THIRD-PARTY INTEGRATION IDs (optional)</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="admin-label">Shopify Product ID</label>
                <input type="text" value={form.shopifyProductId} onChange={(e) => set("shopifyProductId", e.target.value)} className="admin-input text-xs" placeholder="gid://shopify/Product/..." />
              </div>
              <div>
                <label className="admin-label">Shopify Variant ID</label>
                <input type="text" value={form.shopifyVariantId} onChange={(e) => set("shopifyVariantId", e.target.value)} className="admin-input text-xs" placeholder="gid://shopify/ProductVariant/..." />
              </div>
              <div>
                <label className="admin-label">Printify Product ID</label>
                <input type="text" value={form.printifyProductId} onChange={(e) => set("printifyProductId", e.target.value)} className="admin-input text-xs" placeholder="printify-product-id" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button onClick={onClose} className="admin-btn-secondary">Cancel</button>
          <button
            onClick={() => onSave(form)}
            disabled={isLoading || !form.name || !form.price}
            className="admin-btn-primary flex items-center gap-2"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isLoading ? "Saving..." : "Save Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const { data: settings, refetch } = trpc.admin.getSettings.useQuery();
  const [form, setForm] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const bulkSave = trpc.admin.bulkSetSettings.useMutation({
    onSuccess: () => { toast.success("Settings saved"); refetch(); },
    onError: () => toast.error("Failed to save settings"),
  });

  if (settings && !initialized) {
    setForm({
      contact_email: settings.contact_email || "",
      instagram: settings.instagram || "",
      tiktok: settings.tiktok || "",
      twitter: settings.twitter || "",
      announcement_text: settings.announcement_text || "NEW DROP LIVE — FREE SHIPPING OVER $100",
      announcement_link: settings.announcement_link || "/shop",
      free_shipping_threshold: settings.free_shipping_threshold || "100",
    });
    setInitialized(true);
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="bg-[#1A1A1A] border border-white/10 p-6">
        <h3 className="font-display text-white font-bold tracking-widest text-xs mb-4">CONTACT & SOCIAL</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="admin-label">Contact Email</label>
            <input type="email" value={form.contact_email || ""} onChange={(e) => set("contact_email", e.target.value)} className="admin-input" placeholder="info@buildlevel.com" />
          </div>
          <div>
            <label className="admin-label">Instagram Handle</label>
            <input type="text" value={form.instagram || ""} onChange={(e) => set("instagram", e.target.value)} className="admin-input" placeholder="@buildlevel" />
          </div>
          <div>
            <label className="admin-label">TikTok Handle</label>
            <input type="text" value={form.tiktok || ""} onChange={(e) => set("tiktok", e.target.value)} className="admin-input" placeholder="@buildlevel" />
          </div>
          <div>
            <label className="admin-label">Twitter/X Handle</label>
            <input type="text" value={form.twitter || ""} onChange={(e) => set("twitter", e.target.value)} className="admin-input" placeholder="@buildlevel" />
          </div>
        </div>
      </div>

      <div className="bg-[#1A1A1A] border border-white/10 p-6">
        <h3 className="font-display text-white font-bold tracking-widest text-xs mb-4">ANNOUNCEMENT BANNER</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="admin-label">Banner Text</label>
            <input type="text" value={form.announcement_text || ""} onChange={(e) => set("announcement_text", e.target.value)} className="admin-input" placeholder="NEW DROP LIVE — FREE SHIPPING OVER $100" />
          </div>
          <div>
            <label className="admin-label">Banner Link</label>
            <input type="text" value={form.announcement_link || ""} onChange={(e) => set("announcement_link", e.target.value)} className="admin-input" placeholder="/shop" />
          </div>
        </div>
      </div>

      <div className="bg-[#1A1A1A] border border-white/10 p-6">
        <h3 className="font-display text-white font-bold tracking-widest text-xs mb-4">SHIPPING</h3>
        <div>
          <label className="admin-label">Free Shipping Threshold (USD)</label>
          <input type="number" value={form.free_shipping_threshold || ""} onChange={(e) => set("free_shipping_threshold", e.target.value)} className="admin-input max-w-xs" placeholder="100" />
        </div>
      </div>

      <div className="bg-[#1A1A1A] border border-white/10 p-6">
        <h3 className="font-display text-white font-bold tracking-widest text-xs mb-4">THIRD-PARTY INTEGRATIONS</h3>
        <div className="space-y-3">
          {[
            { name: "Shopify", url: "https://shopify.com", desc: "Connect your Shopify store for full checkout & inventory management" },
            { name: "Printify", url: "https://printify.com", desc: "Print-on-demand fulfillment — connect to Shopify first" },
            { name: "Tidio AI Chat", url: "https://tidio.com", desc: "Activate live AI chat by adding your Tidio key to index.html" },
            { name: "Stripe", url: "https://dashboard.stripe.com", desc: "Manage payments, refunds, and payouts" },
          ].map((item) => (
            <div key={item.name} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
              <div>
                <p className="font-display text-white text-xs font-bold tracking-wider">{item.name}</p>
                <p className="font-body text-[#666] text-xs mt-0.5">{item.desc}</p>
              </div>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="admin-btn-secondary flex items-center gap-1.5 text-xs">
                <ExternalLink size={11} /> Open
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => bulkSave.mutate(form)}
          disabled={bulkSave.isPending}
          className="admin-btn-primary flex items-center gap-2"
        >
          {bulkSave.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {bulkSave.isPending ? "Saving..." : "Save All Settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Admin Panel ─────────────────────────────────────────────────────────

export default function Admin() {
  const [tab, setTab] = useState<"products" | "settings">("products");
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<(ProductFormData & { id?: number }) | null>(null);

  const { data: productList = [], refetch } = trpc.admin.listProducts.useQuery();

  const createProduct = trpc.admin.createProduct.useMutation({
    onSuccess: () => { toast.success("Product created!"); setShowModal(false); refetch(); },
    onError: () => toast.error("Failed to create product"),
  });

  const updateProduct = trpc.admin.updateProduct.useMutation({
    onSuccess: () => { toast.success("Product updated!"); setEditProduct(null); refetch(); },
    onError: () => toast.error("Failed to update product"),
  });

  const deleteProduct = trpc.admin.deleteProduct.useMutation({
    onSuccess: () => { toast.success("Product deleted"); refetch(); },
    onError: () => toast.error("Failed to delete product"),
  });

  const handleSave = (form: ProductFormData & { id?: number }) => {
    const data = {
      name: form.name,
      description: form.description || undefined,
      price: parseFloat(form.price),
      compareAtPrice: form.compareAtPrice ? parseFloat(form.compareAtPrice) : undefined,
      category: form.category,
      sizes: form.sizes.split(",").map((s) => s.trim()).filter(Boolean),
      imageUrl: form.imageUrl || undefined,
      badge: form.badge || undefined,
      inStock: form.inStock,
      featured: form.featured,
      sortOrder: parseInt(form.sortOrder) || 0,
      shopifyVariantId: form.shopifyVariantId || undefined,
      shopifyProductId: form.shopifyProductId || undefined,
      printifyProductId: form.printifyProductId || undefined,
    };

    if (form.id) {
      updateProduct.mutate({ id: form.id, data });
    } else {
      createProduct.mutate(data);
    }
  };

  const openEdit = (p: typeof productList[0]) => {
    setEditProduct({
      id: p.id,
      name: p.name,
      description: p.description || "",
      price: String(p.price),
      compareAtPrice: p.compareAtPrice ? String(p.compareAtPrice) : "",
      category: p.category,
      sizes: (p.sizes as string[]).join(","),
      badge: p.badge || "",
      inStock: p.inStock ?? true,
      featured: p.featured ?? false,
      sortOrder: String(p.sortOrder),
      shopifyVariantId: p.shopifyVariantId || "",
      shopifyProductId: p.shopifyProductId || "",
      printifyProductId: p.printifyProductId || "",
      imageUrl: p.imageUrl || "",
    });
  };

  const confirmDelete = (id: number, name: string) => {
    if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      deleteProduct.mutate({ id });
    }
  };

  return (
    <AdminGuard>
      <div className="min-h-screen bg-[#111] text-white">
        {/* Top Bar */}
        <div className="bg-[#1A1A1A] border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[#555] hover:text-white transition-colors">
              <ChevronLeft size={18} />
            </Link>
            <div>
              <p className="font-display text-white font-bold tracking-widest text-sm">BUILD LEVEL</p>
              <p className="font-body text-[#555] text-xs">Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/shop" target="_blank" className="admin-btn-secondary flex items-center gap-1.5 text-xs">
              <ExternalLink size={11} /> View Shop
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-white/10 px-6 flex gap-0">
          {[
            { id: "products", label: "PRODUCTS", icon: Package },
            { id: "settings", label: "SETTINGS", icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as "products" | "settings")}
              className={`flex items-center gap-2 px-5 py-4 font-display text-xs font-bold tracking-widest border-b-2 transition-colors ${
                tab === id
                  ? "border-[#FF6B00] text-white"
                  : "border-transparent text-[#555] hover:text-[#888]"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 max-w-6xl mx-auto">
          {tab === "products" && (
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="font-display text-white font-bold tracking-widest text-lg">PRODUCTS</h1>
                  <p className="font-body text-[#555] text-sm mt-1">{productList.length} products in your store</p>
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="admin-btn-primary flex items-center gap-2"
                >
                  <Plus size={14} /> ADD PRODUCT
                </button>
              </div>

              {/* Empty state */}
              {productList.length === 0 && (
                <div className="bg-[#1A1A1A] border border-white/10 border-dashed p-12 text-center">
                  <ShoppingBag size={32} className="text-[#333] mx-auto mb-3" />
                  <p className="font-display text-[#555] text-sm tracking-widest">NO PRODUCTS YET</p>
                  <p className="font-body text-[#444] text-xs mt-1">Click "ADD PRODUCT" to add your first product</p>
                </div>
              )}

              {/* Product Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {productList.map((p) => (
                  <div key={p.id} className="bg-[#1A1A1A] border border-white/10 overflow-hidden">
                    {/* Image */}
                    <div className="aspect-square bg-[#2A2A2A] relative overflow-hidden">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={32} className="text-[#333]" />
                        </div>
                      )}
                      {p.badge && (
                        <span className="absolute top-2 left-2 bg-[#FF6B00] text-white font-display text-[9px] font-bold tracking-widest px-2 py-1">
                          {p.badge}
                        </span>
                      )}
                      {!p.inStock && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="font-display text-white text-xs tracking-widest">OUT OF STOCK</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-display text-white text-sm font-bold tracking-wider leading-tight">{p.name}</p>
                        {p.featured && <Star size={12} className="text-[#FF6B00] flex-shrink-0 mt-0.5" fill="#FF6B00" />}
                      </div>
                      <p className="font-body text-[#888] text-xs mb-3">{p.category}</p>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="font-display text-[#FF6B00] font-bold text-sm">${Number(p.price).toFixed(2)}</span>
                        {p.compareAtPrice && (
                          <span className="font-body text-[#555] text-xs line-through">${Number(p.compareAtPrice).toFixed(2)}</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          className="flex-1 admin-btn-secondary flex items-center justify-center gap-1.5 text-xs"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                        <button
                          onClick={() => confirmDelete(p.id, p.name)}
                          disabled={deleteProduct.isPending}
                          className="admin-btn-danger flex items-center justify-center gap-1.5 text-xs px-3"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "settings" && <SettingsTab />}
        </div>

        {/* Add Product Modal */}
        {showModal && (
          <ProductModal
            initial={EMPTY_FORM}
            onClose={() => setShowModal(false)}
            onSave={handleSave}
            isLoading={createProduct.isPending}
          />
        )}

        {/* Edit Product Modal */}
        {editProduct && (
          <ProductModal
            initial={editProduct}
            onClose={() => setEditProduct(null)}
            onSave={handleSave}
            isLoading={updateProduct.isPending}
          />
        )}
      </div>
    </AdminGuard>
  );
}
