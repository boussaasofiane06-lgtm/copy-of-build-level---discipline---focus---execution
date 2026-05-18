/* ==========================================================================
   BUILD LEVEL — Admin Panel
   Private dashboard for managing products, prices, and site settings
   Only accessible to admin users (role = 'admin')
   ========================================================================== */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  listProducts, createProduct, updateProduct, deleteProduct,
  listBlogPosts, createBlogPost, updateBlogPost, deleteBlogPost,
  listDigitalProducts, createDigitalProduct, updateDigitalProduct, deleteDigitalProduct,
  listVideos, createVideo, updateVideo, deleteVideo,
  listAffiliateProducts, createAffiliateProduct, updateAffiliateProduct, deleteAffiliateProduct,
  listMembershipTiers, createMembershipTier, updateMembershipTier, deleteMembershipTier,
  adminMe, getSettings, saveSettings,
  type Product, type BlogPost, type DigitalProduct, type AIVideo, type AffiliateProduct, type MembershipTier,
} from "@/lib/adminApi";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Plus, Pencil, Trash2, Upload, Save, X, Package, Settings,
  ShoppingBag, ToggleLeft, ToggleRight, Star, StarOff, ChevronLeft,
  Loader2, Image as ImageIcon, ExternalLink, BookOpen, Download,
  Video, Link2, Users, Printer, MessageSquare, CreditCard, BarChart3,
  Bell, Palette, Workflow, Database, ShieldCheck, Boxes
} from "lucide-react";
import PrintifyTab from "./admin/PrintifyTab";
import ShopifyTab from "./admin/ShopifyTab";
import AIChatTab from "./admin/AIChatTab";

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
  published: boolean;
  hidden: boolean;
  delisted: boolean;
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
  inStock: true, published: false, hidden: false, delisted: false, featured: false, sortOrder: "0",
  shopifyVariantId: "", shopifyProductId: "", printifyProductId: "", imageUrl: "",
};

const CATEGORIES = ["hoodies", "t-shirts", "hats", "accessories", "apparel"];

// ─── Password Login ──────────────────────────────────────────────────────────

const ADMIN_SESSION_KEY = "bl_admin_unlocked";
const ADMIN_TOKEN_KEY = "bl_admin_token";

function AdminPasswordLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // Call backend login — it verifies the password server-side and returns a JWT token
      const resp = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const data = await resp.json();
      if (data.success && data.token) {
        // Store the JWT token — used as Authorization: Bearer header on all admin API calls
        sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
        sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        onSuccess();
      } else {
        setError("Incorrect password. Try again.");
      }
    } catch {
      setError("Could not connect to server. Try again.");
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
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(
    () => sessionStorage.getItem(ADMIN_SESSION_KEY) === "1"
  );

  useEffect(() => {
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) !== "1") return;
    let alive = true;
    adminMe()
      .then((result) => {
        if (!alive) return;
        if (result.admin) {
          setUnlocked(true);
        } else {
          sessionStorage.removeItem(ADMIN_SESSION_KEY);
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
          setUnlocked(false);
        }
      })
      .catch(() => {
        if (!alive) return;
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        setUnlocked(false);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => { alive = false; };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#111] text-white flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-[#FF6B00]" />
      </div>
    );
  }

  if (!unlocked) {
    return <AdminPasswordLogin onSuccess={() => setUnlocked(true)} />;
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
  const set = (k: keyof ProductFormData, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const [uploading, setUploading] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setForm((f) => ({ ...f, imageUrl: dataUrl }));
      toast.success("Image ready!");
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.onerror = () => {
      toast.error("Failed to read image");
      setUploading(false);
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
                  disabled={uploading}
                  className="admin-btn-secondary flex items-center gap-2 text-xs"
                >
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {uploading ? "Uploading..." : "Upload from Device"}
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
          <div className="md:col-span-2 flex flex-wrap items-center gap-5 pt-2">
            <button type="button" onClick={() => set("published", !form.published)} className="flex items-center gap-2 text-xs font-body">
              {form.published ? <ToggleRight size={20} className="text-green-400" /> : <ToggleLeft size={20} className="text-[#555]" />}
              <span className={form.published ? "text-green-400" : "text-[#555]"}>Published</span>
            </button>
            <button type="button" onClick={() => set("inStock", !form.inStock)} className="flex items-center gap-2 text-xs font-body">
              {form.inStock ? <ToggleRight size={20} className="text-green-400" /> : <ToggleLeft size={20} className="text-[#555]" />}
              <span className={form.inStock ? "text-green-400" : "text-[#555]"}>In Stock</span>
            </button>
            <button type="button" onClick={() => set("hidden", !form.hidden)} className="flex items-center gap-2 text-xs font-body">
              {form.hidden ? <ToggleRight size={20} className="text-yellow-400" /> : <ToggleLeft size={20} className="text-[#555]" />}
              <span className={form.hidden ? "text-yellow-400" : "text-[#555]"}>Hidden</span>
            </button>
            <button type="button" onClick={() => set("delisted", !form.delisted)} className="flex items-center gap-2 text-xs font-body">
              {form.delisted ? <ToggleRight size={20} className="text-red-400" /> : <ToggleLeft size={20} className="text-[#555]" />}
              <span className={form.delisted ? "text-red-400" : "text-[#555]"}>Delisted</span>
            </button>
            <button type="button" onClick={() => set("featured", !form.featured)} className="flex items-center gap-2 text-xs font-body">
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
  const [form, setForm] = useState<Record<string, string>>({
    contact_email: "", instagram: "", tiktok: "", twitter: "",
    announcement_text: "NEW DROP LIVE — FREE SHIPPING OVER $100",
    announcement_link: "/shop", free_shipping_threshold: "100",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then(data => {
      setForm({
        contact_email: data.contact_email || "",
        instagram: data.instagram || "",
        tiktok: data.tiktok || "",
        twitter: data.twitter || "",
        announcement_text: data.announcement_text || "NEW DROP LIVE — FREE SHIPPING OVER $100",
        announcement_link: data.announcement_link || "/shop",
        free_shipping_threshold: data.free_shipping_threshold || "100",
      });
    }).catch(() => {});
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await saveSettings(form);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

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
          onClick={handleSaveSettings}
          disabled={saving}
          className="admin-btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Saving..." : "Save All Settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Blog Tab ───────────────────────────────────────────────────────────────

const BLOG_CATEGORIES = ["mindset", "training", "discipline", "nutrition", "lifestyle"];

function BlogTab() {
  const [showForm, setShowForm] = useState(false);
  const [editPost, setEditPost] = useState<null | {
    id?: number; title: string; slug: string; excerpt: string;
    content: string; imageUrl: string; category: string; published: boolean;
  }>(null);

  const EMPTY_POST = { title: "", slug: "", excerpt: "", content: "", imageUrl: "", category: "mindset", published: false };

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [blogSaving, setBlogSaving] = useState(false);
  const [blogDeleting, setBlogDeleting] = useState<number | null>(null);

  const loadPosts = useCallback(async () => {
    try { setPosts(await listBlogPosts()); } catch { toast.error("Failed to load posts"); }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const form = editPost || (showForm ? EMPTY_POST : null);

  const handleSave = async () => {
    if (!form) return;
    if (!form.title || !form.slug || !form.content) { toast.error("Title, slug, and content are required"); return; }
    setBlogSaving(true);
    try {
      if (editPost?.id) {
        await updateBlogPost(editPost.id, { title: form.title, slug: form.slug, excerpt: form.excerpt || undefined, content: form.content, imageUrl: form.imageUrl || undefined, published: form.published });
        toast.success("Post updated!"); setEditPost(null);
      } else {
        await createBlogPost({ title: form.title, slug: form.slug, excerpt: form.excerpt || undefined, content: form.content, imageUrl: form.imageUrl || undefined, published: form.published, featured: false });
        toast.success("Post created!"); setShowForm(false);
      }
      await loadPosts();
    } catch { toast.error("Failed to save post"); }
    finally { setBlogSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-white font-bold tracking-widest text-lg">BLOG POSTS</h1>
          <p className="font-body text-[#555] text-sm mt-1">{posts.length} posts total</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditPost(null); }} className="admin-btn-primary flex items-center gap-2">
          <Plus size={14} /> NEW POST
        </button>
      </div>

      {/* Form */}
      {(showForm || editPost) && (
        <div className="bg-[#1A1A1A] border border-[#FF6B00]/30 p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">TITLE *</label>
              <input value={form?.title || ""} onChange={e => { const v = e.target.value; if (editPost) setEditPost(p => p ? { ...p, title: v, slug: p.slug || v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") } : null); else setShowForm(true); }} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="Post title" />
            </div>
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">SLUG *</label>
              <input value={form?.slug || ""} onChange={e => { const v = e.target.value; if (editPost) setEditPost(p => p ? { ...p, slug: v } : null); }} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="post-url-slug" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">CATEGORY</label>
              <select value={form?.category || "mindset"} onChange={e => { const v = e.target.value; if (editPost) setEditPost(p => p ? { ...p, category: v } : null); }} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]">
                {BLOG_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">IMAGE URL</label>
              <input value={form?.imageUrl || ""} onChange={e => { const v = e.target.value; if (editPost) setEditPost(p => p ? { ...p, imageUrl: v } : null); }} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">EXCERPT (short summary)</label>
            <input value={form?.excerpt || ""} onChange={e => { const v = e.target.value; if (editPost) setEditPost(p => p ? { ...p, excerpt: v } : null); }} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="One-line summary shown on blog listing" />
          </div>
          <div>
            <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">CONTENT *</label>
            <textarea value={form?.content || ""} onChange={e => { const v = e.target.value; if (editPost) setEditPost(p => p ? { ...p, content: v } : null); }} rows={10} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00] resize-y" placeholder="Write your post content here..." />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form?.published || false} onChange={e => { const v = e.target.checked; if (editPost) setEditPost(p => p ? { ...p, published: v } : null); }} className="accent-[#FF6B00]" />
              <span className="font-display text-[#888] text-xs tracking-widest">PUBLISH (visible to customers)</span>
            </label>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setEditPost(null); }} className="admin-btn-secondary">CANCEL</button>
              <button onClick={handleSave} disabled={blogSaving} className="admin-btn-primary flex items-center gap-2">
                {blogSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {editPost?.id ? "UPDATE" : "CREATE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post List */}
      {posts.length === 0 && !showForm ? (
        <div className="bg-[#1A1A1A] border border-white/10 border-dashed p-12 text-center">
          <BookOpen size={32} className="text-[#333] mx-auto mb-3" />
          <p className="font-display text-[#555] text-sm tracking-widest">NO POSTS YET</p>
          <p className="font-body text-[#444] text-xs mt-1">Click "NEW POST" to write your first blog post</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post: any) => (
            <div key={post.id} className="bg-[#1A1A1A] border border-white/10 p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-display text-[10px] tracking-widest px-2 py-0.5 ${post.published ? "bg-green-500/20 text-green-400" : "bg-[#333] text-[#666]"}`}>
                    {post.published ? "LIVE" : "DRAFT"}
                  </span>
                  <span className="font-display text-[#FF6B00] text-[10px] tracking-widest">{post.category?.toUpperCase()}</span>
                </div>
                <p className="font-display text-white font-bold tracking-wide text-sm truncate">{post.title}</p>
                <p className="font-body text-[#555] text-xs mt-0.5">/blog/{post.slug}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => { setEditPost({ id: post.id, title: post.title, slug: post.slug, excerpt: post.excerpt || "", content: post.content, imageUrl: post.imageUrl || "", category: post.category || "mindset", published: post.published ?? false }); setShowForm(false); }} className="p-1.5 text-[#555] hover:text-white transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={async () => { if (window.confirm(`Delete "${post.title}"?`)) { setBlogDeleting(post.id); try { await deleteBlogPost(post.id); toast.success("Post deleted"); await loadPosts(); } catch { toast.error("Delete failed"); } finally { setBlogDeleting(null); } } }} disabled={blogDeleting === post.id} className="p-1.5 text-[#555] hover:text-red-400 transition-colors disabled:opacity-50">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Digital Products Tab ─────────────────────────────────────────────────────

const DIGITAL_CATEGORIES = ["guide", "workout", "nutrition", "mindset", "wallpaper"];

function DigitalTab() {
  type FormData = {
    id?: number; name: string; description: string; price: string;
    category: string; productType: string; imageUrl: string; fileUrl: string; fileName: string;
    audioUrl: string; duration: string; badge: string; stripePaymentLink: string; published: boolean;
  };
  const EMPTY_FORM: FormData = { name: "", description: "", price: "", category: "guide", productType: "pdf", imageUrl: "", fileUrl: "", fileName: "", audioUrl: "", duration: "", badge: "", stripePaymentLink: "", published: false };

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);

  const [items, setItems] = useState<DigitalProduct[]>([]);
  const [digitalSaving, setDigitalSaving] = useState(false);
  const [digitalDeleting, setDigitalDeleting] = useState<number | null>(null);

  const loadItems = useCallback(async () => {
    try { setItems(await listDigitalProducts()); } catch { toast.error("Failed to load digital products"); }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const setField = (field: keyof FormData, value: string | boolean) =>
    setFormData(p => ({ ...p, [field]: value }));

  const openAdd = () => { setFormData(EMPTY_FORM); setShowForm(true); };
  const openEdit = (item: any) => {
    setFormData({ id: item.id, name: item.name, description: item.description || "", price: String(item.price), category: item.category || "guide", productType: item.productType || "pdf", imageUrl: item.imageUrl || "", fileUrl: item.fileUrl || "", fileName: item.fileName || "", audioUrl: item.audioUrl || "", duration: item.duration || "", badge: item.badge || "", stripePaymentLink: item.stripePaymentLink || "", published: item.published ?? false });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setFormData(EMPTY_FORM); };

  const [digitalImgUploading, setDigitalImgUploading] = useState(false);
  const digitalImgRef = useRef<HTMLInputElement>(null);

  const handleDigitalImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setDigitalImgUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setField('imageUrl', reader.result as string);
      toast.success("Image ready!");
      setDigitalImgUploading(false);
      if (digitalImgRef.current) digitalImgRef.current.value = "";
    };
    reader.onerror = () => { toast.error("Failed to read image"); setDigitalImgUploading(false); };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) { toast.error("Name and price are required"); return; }
    const price = parseFloat(formData.price);
    if (isNaN(price) || price < 0) { toast.error("Invalid price"); return; }
    const payload = { name: formData.name, description: formData.description || undefined, price: String(price), category: formData.category, imageUrl: formData.imageUrl || undefined, fileUrl: formData.fileUrl || undefined, fileName: formData.fileName || undefined, badge: formData.badge || undefined, stripePaymentLink: formData.stripePaymentLink || undefined, published: formData.published };
    setDigitalSaving(true);
    try {
      if (formData.id) {
        await updateDigitalProduct(formData.id, payload);
        toast.success("Product updated!");
      } else {
        await createDigitalProduct(payload);
        toast.success("Product created!");
      }
      setShowForm(false); setFormData(EMPTY_FORM); await loadItems();
    } catch { toast.error("Failed to save product"); }
    finally { setDigitalSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-white font-bold tracking-widest text-lg">DIGITAL PRODUCTS</h1>
          <p className="font-body text-[#555] text-sm mt-1">{items.length} products total</p>
        </div>
        <button onClick={openAdd} className="admin-btn-primary flex items-center gap-2">
          <Plus size={14} /> ADD PRODUCT
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-[#1A1A1A] border border-[#FF6B00]/30 p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">NAME *</label>
              <input value={formData.name} onChange={e => setField('name', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="e.g. 12-Week Workout Plan" />
            </div>
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">PRICE (USD) *</label>
              <input type="number" min="0" step="0.01" value={formData.price} onChange={e => setField('price', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="9.99" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">PRODUCT TYPE</label>
              <select value={formData.productType} onChange={e => setField('productType', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]">
                <option value="pdf">PDF Guide</option>
                <option value="audiobook">Audiobook</option>
                <option value="video">Video</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">CATEGORY</label>
              <select value={formData.category} onChange={e => setField('category', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]">
                {DIGITAL_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">BADGE (optional)</label>
              <input value={formData.badge} onChange={e => setField('badge', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="e.g. BESTSELLER, NEW" />
            </div>
          </div>
          <div>
            <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">DESCRIPTION</label>
            <textarea value={formData.description} onChange={e => setField('description', e.target.value)} rows={3} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00] resize-y" placeholder="What's included in this product?" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">PRODUCT IMAGE</label>
              <div className="flex items-center gap-2 mb-2">
                {formData.imageUrl && (
                  <img src={formData.imageUrl} alt="preview" className="w-12 h-12 object-cover border border-white/10 flex-shrink-0" />
                )}
                <input ref={digitalImgRef} type="file" accept="image/*" onChange={handleDigitalImage} className="hidden" />
                <button type="button" onClick={() => digitalImgRef.current?.click()} disabled={digitalImgUploading}
                  className="bg-[#2A2A2A] border border-white/10 text-white font-display text-[10px] tracking-widest px-3 py-2 hover:border-[#FF6B00] transition-colors flex items-center gap-1 disabled:opacity-50">
                  {digitalImgUploading ? "LOADING..." : "UPLOAD FROM DEVICE"}
                </button>
              </div>
              <input value={formData.imageUrl.startsWith('data:') ? '' : formData.imageUrl} onChange={e => setField('imageUrl', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="Or paste image URL" />
            </div>
            <div>
              <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">FILE NAME (shown to buyer)</label>
              <input value={formData.fileName} onChange={e => setField('fileName', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="e.g. workout-plan.pdf" />
            </div>
          </div>
          <div>
            <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">DOWNLOAD FILE URL (PDF, MP3, or any file link)</label>
            <input value={formData.fileUrl} onChange={e => setField('fileUrl', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="https://... (Google Drive, Dropbox, or direct file link)" />
          </div>
          <div>
            <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">STRIPE PAYMENT LINK (buy.stripe.com/...)</label>
            <input value={formData.stripePaymentLink} onChange={e => setField('stripePaymentLink', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="https://buy.stripe.com/... (paste your Stripe Payment Link)" />
            <p className="font-body text-[#444] text-[10px] mt-1">Create payment links at dashboard.stripe.com → Payment Links. Customers click BUY NOW and go directly to this link.</p>
          </div>
          {(formData.productType === "audiobook" || formData.productType === "video") && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">AUDIO/VIDEO STREAM URL (for preview player)</label>
                <input value={formData.audioUrl} onChange={e => setField('audioUrl', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="https://... (MP3 or audio stream URL)" />
              </div>
              <div>
                <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1">DURATION (e.g. 2h 30min)</label>
                <input value={formData.duration} onChange={e => setField('duration', e.target.value)} className="w-full bg-[#111] border border-white/10 text-white font-body text-sm px-3 py-2 outline-none focus:border-[#FF6B00]" placeholder="e.g. 2h 30min" />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.published} onChange={e => setField('published', e.target.checked)} className="accent-[#FF6B00]" />
              <span className="font-display text-[#888] text-xs tracking-widest">PUBLISH (visible to customers)</span>
            </label>
            <div className="flex gap-2">
              <button onClick={closeForm} className="admin-btn-secondary">CANCEL</button>
              <button onClick={handleSave} disabled={digitalSaving} className="admin-btn-primary flex items-center gap-2">
                {digitalSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {formData.id ? "UPDATE" : "CREATE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item List */}
      {items.length === 0 && !showForm && !formData.id ? (
        <div className="bg-[#1A1A1A] border border-white/10 border-dashed p-12 text-center">
          <Download size={32} className="text-[#333] mx-auto mb-3" />
          <p className="font-display text-[#555] text-sm tracking-widest">NO DIGITAL PRODUCTS YET</p>
          <p className="font-body text-[#444] text-xs mt-1">Click "ADD PRODUCT" to create your first digital product</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => (
            <div key={item.id} className="bg-[#1A1A1A] border border-white/10 p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-display text-[10px] tracking-widest px-2 py-0.5 ${item.published ? "bg-green-500/20 text-green-400" : "bg-[#333] text-[#666]"}`}>
                    {item.published ? "LIVE" : "DRAFT"}
                  </span>
                  <span className="font-display text-[#FF6B00] text-[10px] tracking-widest">{item.category?.toUpperCase()}</span>
                </div>
                <p className="font-display text-white font-bold tracking-wide text-sm truncate">{item.name}</p>
                <p className="font-body text-[#555] text-xs mt-0.5">${item.price.toFixed(2)} · {item.fileUrl ? "File linked ✓" : "No file linked"}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openEdit(item)} className="p-1.5 text-[#555] hover:text-white transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={async () => { if (window.confirm(`Delete "${item.name}"?`)) { setDigitalDeleting(item.id); try { await deleteDigitalProduct(item.id); toast.success("Product deleted"); await loadItems(); } catch { toast.error("Delete failed"); } finally { setDigitalDeleting(null); } } }} disabled={digitalDeleting === item.id} className="p-1.5 text-[#555] hover:text-red-400 transition-colors disabled:opacity-50">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AI Videos Tab ──────────────────────────────────────────────────────────

function AIVideosTab() {
  const EMPTY_VIDEO = { title: "", description: "", videoUrl: "", thumbnailUrl: "", category: "motivation", duration: "", badge: "", published: false, sortOrder: 0 };
  const [videos, setVideos] = useState<AIVideo[]>([]);
  const [videoSaving, setVideoSaving] = useState(false);
  const [videoDeleting, setVideoDeleting] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_VIDEO);

  const loadVideos = useCallback(async () => {
    try { setVideos(await listVideos()); } catch { toast.error("Failed to load videos"); }
  }, []);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setVideoSaving(true);
    try {
      if (editItem) { await updateVideo(editItem.id, form); toast.success("Video updated!"); setEditItem(null); }
      else { await createVideo(form); toast.success("Video added!"); }
      setShowForm(false); setForm(EMPTY_VIDEO); await loadVideos();
    } catch { toast.error("Failed to save video"); }
    finally { setVideoSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-white font-bold tracking-widest text-lg">AI VIDEOS</h1>
          <p className="font-body text-[#555] text-sm mt-1">Manage AI-generated motivational videos. Hidden from public until published.</p>
        </div>
        <button onClick={() => { setEditItem(null); setForm(EMPTY_VIDEO); setShowForm(true); }} className="admin-btn-primary flex items-center gap-2">
          <Plus size={14} /> ADD VIDEO
        </button>
      </div>

      {showForm && (
        <div className="bg-[#1A1A1A] border border-white/10 p-6 mb-6">
          <h2 className="font-display text-white font-bold tracking-widest text-sm mb-4">{editItem ? "EDIT VIDEO" : "NEW VIDEO"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="admin-label">TITLE *</label><input className="admin-input" value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Video title" /></div>
            <div><label className="admin-label">CATEGORY</label><select className="admin-input" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}><option value="motivation">Motivation</option><option value="training">Training</option><option value="mindset">Mindset</option><option value="discipline">Discipline</option></select></div>
            <div><label className="admin-label">VIDEO URL</label><input className="admin-input" value={form.videoUrl} onChange={e => setForm(f => ({...f, videoUrl: e.target.value}))} placeholder="YouTube, Vimeo, or direct URL" /></div>
            <div><label className="admin-label">THUMBNAIL URL</label><input className="admin-input" value={form.thumbnailUrl} onChange={e => setForm(f => ({...f, thumbnailUrl: e.target.value}))} placeholder="Thumbnail image URL" /></div>
            <div><label className="admin-label">DURATION</label><input className="admin-input" value={form.duration} onChange={e => setForm(f => ({...f, duration: e.target.value}))} placeholder="e.g. 3:45" /></div>
            <div><label className="admin-label">BADGE</label><input className="admin-input" value={form.badge} onChange={e => setForm(f => ({...f, badge: e.target.value}))} placeholder="e.g. NEW, FEATURED" /></div>
            <div className="md:col-span-2"><label className="admin-label">DESCRIPTION</label><textarea className="admin-input" rows={3} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Video description" /></div>
            <div className="flex items-center gap-3">
              <label className="admin-label">PUBLISHED</label>
              <button onClick={() => setForm(f => ({...f, published: !f.published}))} className="text-[#FF6B00]">{form.published ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}</button>
              <span className="font-body text-xs text-[#555]">{form.published ? "Live" : "Draft"}</span>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={videoSaving} className="admin-btn-primary flex items-center gap-2">{videoSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} SAVE</button>
            <button onClick={() => { setShowForm(false); setEditItem(null); }} className="admin-btn-secondary">CANCEL</button>
          </div>
        </div>
      )}

      {videos.length === 0 && !showForm && (
        <div className="bg-[#1A1A1A] border border-white/10 border-dashed p-12 text-center">
          <Video size={32} className="text-[#333] mx-auto mb-3" />
          <p className="font-display text-[#555] text-xs tracking-widest">NO VIDEOS YET</p>
          <p className="font-body text-[#444] text-xs mt-1">Add your first AI video to get started.</p>
        </div>
      )}

      <div className="space-y-2">
        {videos.map((v: any) => (
          <div key={v.id} className="bg-[#1A1A1A] border border-white/10 p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {v.thumbnailUrl ? <img src={v.thumbnailUrl} className="w-16 h-10 object-cover rounded" /> : <div className="w-16 h-10 bg-[#222] rounded flex items-center justify-center"><Video size={16} className="text-[#444]" /></div>}
              <div>
                <p className="font-display text-white text-sm font-bold tracking-wider">{v.title}</p>
                <p className="font-body text-[#555] text-xs">{v.category} {v.duration ? `• ${v.duration}` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`font-display text-xs tracking-widest px-2 py-0.5 ${v.published ? "bg-green-900/30 text-green-400" : "bg-[#222] text-[#555]"}`}>{v.published ? "LIVE" : "DRAFT"}</span>
              <button onClick={() => { setEditItem(v); setForm({ title: v.title, description: v.description || "", videoUrl: v.videoUrl || "", thumbnailUrl: v.thumbnailUrl || "", category: v.category, duration: v.duration || "", badge: v.badge || "", published: v.published, sortOrder: v.sortOrder }); setShowForm(true); }} className="p-1.5 text-[#555] hover:text-white transition-colors"><Pencil size={14} /></button>
              <button onClick={async () => { if (window.confirm(`Delete "${v.title}"?`)) { setVideoDeleting(v.id); try { await deleteVideo(v.id); toast.success("Deleted"); await loadVideos(); } catch { toast.error("Delete failed"); } finally { setVideoDeleting(null); } } }} disabled={videoDeleting === v.id} className="p-1.5 text-[#555] hover:text-red-400 transition-colors disabled:opacity-50"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Affiliate Tab ────────────────────────────────────────────────────────────

function AffiliateTab() {
  const EMPTY = { name: "", description: "", price: "", affiliateUrl: "", imageUrl: "", category: "gear", brand: "", badge: "", commission: "", published: false, sortOrder: 0 };
  const [items, setItems] = useState<AffiliateProduct[]>([]);
  const [affiliateSaving, setAffiliateSaving] = useState(false);
  const [affiliateDeleting, setAffiliateDeleting] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState(EMPTY);

  const loadItems = useCallback(async () => {
    try { setItems(await listAffiliateProducts()); } catch { toast.error("Failed to load affiliate products"); }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    if (!form.affiliateUrl.trim()) { toast.error("Affiliate URL required"); return; }
    const payload = { ...form, price: form.price ? form.price : undefined };
    setAffiliateSaving(true);
    try {
      if (editItem) { await updateAffiliateProduct(editItem.id, payload); toast.success("Updated!"); setEditItem(null); }
      else { await createAffiliateProduct(payload); toast.success("Product added!"); }
      setShowForm(false); setForm(EMPTY); await loadItems();
    } catch { toast.error("Failed to save"); }
    finally { setAffiliateSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-white font-bold tracking-widest text-lg">AFFILIATE PRODUCTS</h1>
          <p className="font-body text-[#555] text-sm mt-1">Recommend gear and earn commissions. Hidden from public until published.</p>
        </div>
        <button onClick={() => { setEditItem(null); setForm(EMPTY); setShowForm(true); }} className="admin-btn-primary flex items-center gap-2">
          <Plus size={14} /> ADD PRODUCT
        </button>
      </div>

      {showForm && (
        <div className="bg-[#1A1A1A] border border-white/10 p-6 mb-6">
          <h2 className="font-display text-white font-bold tracking-widest text-sm mb-4">{editItem ? "EDIT PRODUCT" : "NEW AFFILIATE PRODUCT"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="admin-label">NAME *</label><input className="admin-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Product name" /></div>
            <div><label className="admin-label">BRAND</label><input className="admin-input" value={form.brand} onChange={e => setForm(f => ({...f, brand: e.target.value}))} placeholder="Brand name" /></div>
            <div><label className="admin-label">AFFILIATE URL *</label><input className="admin-input" value={form.affiliateUrl} onChange={e => setForm(f => ({...f, affiliateUrl: e.target.value}))} placeholder="https://..." /></div>
            <div><label className="admin-label">IMAGE URL</label><input className="admin-input" value={form.imageUrl} onChange={e => setForm(f => ({...f, imageUrl: e.target.value}))} placeholder="Product image URL" /></div>
            <div><label className="admin-label">PRICE (USD)</label><input className="admin-input" type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} placeholder="29.99" /></div>
            <div><label className="admin-label">COMMISSION</label><input className="admin-input" value={form.commission} onChange={e => setForm(f => ({...f, commission: e.target.value}))} placeholder="e.g. 10% or $5" /></div>
            <div><label className="admin-label">CATEGORY</label><select className="admin-input" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}><option value="gear">Gear</option><option value="supplements">Supplements</option><option value="equipment">Equipment</option><option value="books">Books</option><option value="tech">Tech</option></select></div>
            <div><label className="admin-label">BADGE</label><input className="admin-input" value={form.badge} onChange={e => setForm(f => ({...f, badge: e.target.value}))} placeholder="e.g. RECOMMENDED" /></div>
            <div className="md:col-span-2"><label className="admin-label">DESCRIPTION</label><textarea className="admin-input" rows={2} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Short description" /></div>
            <div className="flex items-center gap-3">
              <label className="admin-label">PUBLISHED</label>
              <button onClick={() => setForm(f => ({...f, published: !f.published}))} className="text-[#FF6B00]">{form.published ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}</button>
              <span className="font-body text-xs text-[#555]">{form.published ? "Live" : "Draft"}</span>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={affiliateSaving} className="admin-btn-primary flex items-center gap-2">{affiliateSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} SAVE</button>
            <button onClick={() => { setShowForm(false); setEditItem(null); }} className="admin-btn-secondary">CANCEL</button>
          </div>
        </div>
      )}

      {items.length === 0 && !showForm && (
        <div className="bg-[#1A1A1A] border border-white/10 border-dashed p-12 text-center">
          <Link2 size={32} className="text-[#333] mx-auto mb-3" />
          <p className="font-display text-[#555] text-xs tracking-widest">NO AFFILIATE PRODUCTS YET</p>
          <p className="font-body text-[#444] text-xs mt-1">Add products you recommend and earn commissions.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item: any) => (
          <div key={item.id} className="bg-[#1A1A1A] border border-white/10 p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {item.imageUrl ? <img src={item.imageUrl} className="w-12 h-12 object-cover rounded" /> : <div className="w-12 h-12 bg-[#222] rounded flex items-center justify-center"><Link2 size={16} className="text-[#444]" /></div>}
              <div>
                <p className="font-display text-white text-sm font-bold tracking-wider">{item.name}</p>
                <p className="font-body text-[#555] text-xs">{item.brand ? `${item.brand} • ` : ""}{item.category}{item.commission ? ` • ${item.commission} commission` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`font-display text-xs tracking-widest px-2 py-0.5 ${item.published ? "bg-green-900/30 text-green-400" : "bg-[#222] text-[#555]"}`}>{item.published ? "LIVE" : "DRAFT"}</span>
              <button onClick={() => { setEditItem(item); setForm({ name: item.name, description: item.description || "", price: item.price ? String(item.price) : "", affiliateUrl: item.affiliateUrl, imageUrl: item.imageUrl || "", category: item.category, brand: item.brand || "", badge: item.badge || "", commission: item.commission || "", published: item.published, sortOrder: item.sortOrder }); setShowForm(true); }} className="p-1.5 text-[#555] hover:text-white transition-colors"><Pencil size={14} /></button>
              <button onClick={async () => { if (window.confirm(`Delete "${item.name}"?`)) { setAffiliateDeleting(item.id); try { await deleteAffiliateProduct(item.id); toast.success("Deleted"); await loadItems(); } catch { toast.error("Delete failed"); } finally { setAffiliateDeleting(null); } } }} disabled={affiliateDeleting === item.id} className="p-1.5 text-[#555] hover:text-red-400 transition-colors disabled:opacity-50"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Membership Tab ───────────────────────────────────────────────────────────

function MembershipTab() {
  const EMPTY = { name: "", description: "", price: "", interval: "monthly" as "monthly" | "yearly", features: "", badge: "", stripePaymentLink: "", published: false, sortOrder: 0 };
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberDeleting, setMemberDeleting] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState(EMPTY);

  const loadTiers = useCallback(async () => {
    try { setTiers(await listMembershipTiers()); } catch { toast.error("Failed to load tiers"); }
  }, []);

  useEffect(() => { loadTiers(); }, [loadTiers]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    if (!form.price) { toast.error("Price required"); return; }
    const featuresArr = form.features.split("\n").map((f: string) => f.trim()).filter(Boolean);
    const payload = { ...form, price: form.price, features: featuresArr };
    setMemberSaving(true);
    try {
      if (editItem) { await updateMembershipTier(editItem.id, payload); toast.success("Updated!"); setEditItem(null); }
      else { await createMembershipTier(payload); toast.success("Tier added!"); }
      setShowForm(false); setForm(EMPTY); await loadTiers();
    } catch { toast.error("Failed to save"); }
    finally { setMemberSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-white font-bold tracking-widest text-lg">COMMUNITY MEMBERSHIP</h1>
          <p className="font-body text-[#555] text-sm mt-1">Set up membership tiers for your community. Hidden from public until published.</p>
        </div>
        <button onClick={() => { setEditItem(null); setForm(EMPTY); setShowForm(true); }} className="admin-btn-primary flex items-center gap-2">
          <Plus size={14} /> ADD TIER
        </button>
      </div>

      {showForm && (
        <div className="bg-[#1A1A1A] border border-white/10 p-6 mb-6">
          <h2 className="font-display text-white font-bold tracking-widest text-sm mb-4">{editItem ? "EDIT TIER" : "NEW MEMBERSHIP TIER"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="admin-label">TIER NAME *</label><input className="admin-input" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. ELITE, PRO, BASIC" /></div>
            <div><label className="admin-label">BADGE</label><input className="admin-input" value={form.badge} onChange={e => setForm(f => ({...f, badge: e.target.value}))} placeholder="e.g. MOST POPULAR" /></div>
            <div><label className="admin-label">PRICE (USD) *</label><input className="admin-input" type="number" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} placeholder="9.99" /></div>
            <div><label className="admin-label">BILLING INTERVAL</label><select className="admin-input" value={form.interval} onChange={e => setForm(f => ({...f, interval: e.target.value as "monthly" | "yearly"}))}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>
            <div><label className="admin-label">STRIPE PAYMENT LINK</label><input className="admin-input" value={form.stripePaymentLink} onChange={e => setForm(f => ({...f, stripePaymentLink: e.target.value}))} placeholder="https://buy.stripe.com/... (Stripe Payment Link)" /></div>
            <div className="flex items-center gap-3 pt-6">
              <label className="admin-label">PUBLISHED</label>
              <button onClick={() => setForm(f => ({...f, published: !f.published}))} className="text-[#FF6B00]">{form.published ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}</button>
              <span className="font-body text-xs text-[#555]">{form.published ? "Live" : "Draft"}</span>
            </div>
            <div className="md:col-span-2"><label className="admin-label">DESCRIPTION</label><textarea className="admin-input" rows={2} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="What members get" /></div>
            <div className="md:col-span-2"><label className="admin-label">FEATURES (one per line)</label><textarea className="admin-input" rows={4} value={form.features} onChange={e => setForm(f => ({...f, features: e.target.value}))} placeholder="Access to private community\nWeekly workout plans\nMonthly Q&A calls" /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} disabled={memberSaving} className="admin-btn-primary flex items-center gap-2">{memberSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} SAVE</button>
            <button onClick={() => { setShowForm(false); setEditItem(null); }} className="admin-btn-secondary">CANCEL</button>
          </div>
        </div>
      )}

      {tiers.length === 0 && !showForm && (
        <div className="bg-[#1A1A1A] border border-white/10 border-dashed p-12 text-center">
          <Users size={32} className="text-[#333] mx-auto mb-3" />
          <p className="font-display text-[#555] text-xs tracking-widest">NO MEMBERSHIP TIERS YET</p>
          <p className="font-body text-[#444] text-xs mt-1">Create tiers for your community membership program.</p>
        </div>
      )}

      <div className="space-y-2">
        {tiers.map((tier: any) => (
          <div key={tier.id} className="bg-[#1A1A1A] border border-white/10 p-4 flex items-center justify-between">
            <div>
              <p className="font-display text-white text-sm font-bold tracking-wider">{tier.name} {tier.badge && <span className="text-[#FF6B00] text-xs ml-2">{tier.badge}</span>}</p>
              <p className="font-body text-[#555] text-xs">${tier.price}/{tier.interval} • {Array.isArray(tier.features) ? tier.features.length : 0} features</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`font-display text-xs tracking-widest px-2 py-0.5 ${tier.published ? "bg-green-900/30 text-green-400" : "bg-[#222] text-[#555]"}`}>{tier.published ? "LIVE" : "DRAFT"}</span>
              <button onClick={() => { setEditItem(tier); setForm({ name: tier.name, description: tier.description || "", price: String(tier.price), interval: tier.interval as "monthly" | "yearly", features: Array.isArray(tier.features) ? tier.features.join("\n") : "", badge: tier.badge || "", stripePaymentLink: tier.stripePaymentLink || "", published: tier.published, sortOrder: tier.sortOrder }); setShowForm(true); }} className="p-1.5 text-[#555] hover:text-white transition-colors"><Pencil size={14} /></button>
              <button onClick={async () => { if (window.confirm(`Delete "${tier.name}"?`)) { setMemberDeleting(tier.id); try { await deleteMembershipTier(tier.id); toast.success("Deleted"); await loadTiers(); } catch { toast.error("Delete failed"); } finally { setMemberDeleting(null); } } }} disabled={memberDeleting === tier.id} className="p-1.5 text-[#555] hover:text-red-400 transition-colors disabled:opacity-50"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Admin Control Center ─────────────────────────────────────────────────────

type AdminTab =
  | "overview" | "products" | "inventory" | "orders" | "customers" | "analytics"
  | "blog" | "digital" | "videos" | "affiliate" | "membership"
  | "printify" | "shopify" | "stripe" | "tidio" | "aichat" | "environment" | "theme"
  | "notifications" | "automation" | "settings";

type ControlField = {
  key: string;
  label: string;
  type?: "text" | "select" | "textarea";
  options?: string[];
  placeholder?: string;
};

const controlAreas: Record<string, {
  title: string;
  eyebrow: string;
  description: string;
  icon: typeof Settings;
  fields: ControlField[];
}> = {
  stripe: {
    title: "Stripe Payment Management",
    eyebrow: "Payments",
    description: "Configure payment mode, checkout posture, and operational payment notes without exposing payment systems to customers.",
    icon: CreditCard,
    fields: [
      { key: "stripe_mode", label: "Stripe Mode", type: "select", options: ["test", "live"] },
      { key: "stripe_checkout_status", label: "Checkout Status", type: "select", options: ["enabled", "maintenance", "disabled"] },
      { key: "payment_operations_notes", label: "Payment Operations Notes", type: "textarea", placeholder: "Refund policy, payout notes, fraud checks..." },
    ],
  },
  tidio: {
    title: "Tidio AI Management",
    eyebrow: "Customer Support",
    description: "Keep third-party AI support configuration inside admin. Public customers only see the finished chat experience.",
    icon: MessageSquare,
    fields: [
      { key: "tidio_status", label: "Tidio Status", type: "select", options: ["disabled", "enabled", "testing"] },
      { key: "tidio_public_key", label: "Tidio Public Key", placeholder: "code.tidio.co public key" },
      { key: "support_escalation_email", label: "Escalation Email", placeholder: "support@buildlevel.com" },
    ],
  },
  inventory: {
    title: "Inventory Management",
    eyebrow: "Stock Control",
    description: "Define stock behavior, low-stock alerts, and inventory rules used by product operations.",
    icon: Boxes,
    fields: [
      { key: "inventory_policy", label: "Inventory Policy", type: "select", options: ["manual", "shopify_source", "printify_source"] },
      { key: "low_stock_threshold", label: "Low Stock Threshold", placeholder: "5" },
      { key: "out_of_stock_behavior", label: "Out-of-Stock Behavior", type: "select", options: ["hide", "show_sold_out", "continue_selling"] },
    ],
  },
  orders: {
    title: "Order Management",
    eyebrow: "Fulfillment",
    description: "Centralize order-routing decisions for Shopify, Printify, Stripe, and manual exceptions.",
    icon: ShoppingBag,
    fields: [
      { key: "order_source_of_truth", label: "Order Source of Truth", type: "select", options: ["shopify", "stripe", "manual"] },
      { key: "fulfillment_routing", label: "Fulfillment Routing", type: "select", options: ["printify_first", "manual_review", "shopify_apps"] },
      { key: "order_exception_notes", label: "Exception Handling Notes", type: "textarea" },
    ],
  },
  customers: {
    title: "Customer Management",
    eyebrow: "CRM",
    description: "Control customer support and retention settings without adding CRM surfaces to the public website.",
    icon: Users,
    fields: [
      { key: "customer_system", label: "Customer System", type: "select", options: ["shopify", "manual", "external_crm"] },
      { key: "vip_segment_rule", label: "VIP Segment Rule", placeholder: "Orders > 3 or spend > $250" },
      { key: "customer_notes", label: "Customer Operations Notes", type: "textarea" },
    ],
  },
  analytics: {
    title: "Analytics Overview",
    eyebrow: "Performance",
    description: "Define analytics sources and review the dashboard signals that should remain private to admins.",
    icon: BarChart3,
    fields: [
      { key: "analytics_source", label: "Analytics Source", type: "select", options: ["cloudflare", "umami", "shopify", "manual"] },
      { key: "kpi_focus", label: "KPI Focus", placeholder: "Conversion rate, AOV, returning customers" },
      { key: "weekly_report_email", label: "Weekly Report Email", placeholder: "owner@buildlevel.com" },
    ],
  },
  environment: {
    title: "API / Environment Management",
    eyebrow: "Secure Config",
    description: "Track operational API status and environment ownership. Secret values stay in Render/Railway/Cloudflare, never in the customer UI.",
    icon: Database,
    fields: [
      { key: "render_service_url", label: "Render Service URL", placeholder: "https://build-level.onrender.com" },
      { key: "railway_database_status", label: "Railway Database Status", type: "select", options: ["connected", "maintenance", "not_configured"] },
      { key: "api_change_log", label: "API Change Log", type: "textarea" },
    ],
  },
  theme: {
    title: "Theme / Branding Settings",
    eyebrow: "Brand System",
    description: "Keep storefront branding premium and controlled from admin-only settings.",
    icon: Palette,
    fields: [
      { key: "brand_accent", label: "Accent Color", placeholder: "#FF6B00" },
      { key: "hero_mood", label: "Hero Mood", type: "select", options: ["cinematic", "minimal", "launch_drop"] },
      { key: "brand_notes", label: "Brand Notes", type: "textarea" },
    ],
  },
  notifications: {
    title: "Dashboard Notifications",
    eyebrow: "Alerts",
    description: "Configure internal admin alerts for orders, inventory, sync jobs, and support events.",
    icon: Bell,
    fields: [
      { key: "admin_alert_email", label: "Admin Alert Email", placeholder: "ops@buildlevel.com" },
      { key: "notify_low_stock", label: "Low-Stock Alerts", type: "select", options: ["enabled", "disabled"] },
      { key: "notify_failed_sync", label: "Failed Sync Alerts", type: "select", options: ["enabled", "disabled"] },
    ],
  },
  automation: {
    title: "Automation Controls",
    eyebrow: "Workflows",
    description: "Centralize product sync, fulfillment, customer support, and reporting automation switches.",
    icon: Workflow,
    fields: [
      { key: "product_sync_mode", label: "Product Sync Mode", type: "select", options: ["manual", "scheduled", "webhook"] },
      { key: "auto_publish_imports", label: "Auto-Publish Imports", type: "select", options: ["no", "yes"] },
      { key: "automation_notes", label: "Automation Notes", type: "textarea" },
    ],
  },
};

const overviewCards = [
  { title: "Storefront", detail: "Public routes remain cinematic, mobile-first, and free of system tooling.", icon: ShieldCheck },
  { title: "Products & Inventory", detail: "Manage products, visibility, stock posture, and collections from admin.", icon: Package },
  { title: "Shopify + Printify", detail: "Sync products and fulfillment sources behind protected admin APIs.", icon: Printer },
  { title: "Payments", detail: "Stripe and PayPal posture is tracked in admin-only payment controls.", icon: CreditCard },
  { title: "Customers + Orders", detail: "Order routing, customer systems, and service rules stay private.", icon: Users },
  { title: "Automation", detail: "Sync jobs, notifications, and workflow settings are centralized here.", icon: Workflow },
];

function OverviewTab({ onSelect }: { onSelect: (tab: AdminTab) => void }) {
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden border border-white/10 bg-[#151515] p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,107,0,0.18),transparent_35%)]" />
        <div className="relative">
          <p className="section-label">Admin Command Center</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-white tracking-widest">
            BUILD LEVEL <span className="text-[#FF6B00]">OPERATIONS</span>
          </h1>
          <p className="font-body text-[#888] text-sm max-w-2xl mt-3">
            This dashboard is the protected management layer for integrations, payments, inventory,
            content, customers, analytics, settings, and automation. Customers only see the finished luxury storefront.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {overviewCards.map(({ title, detail, icon: Icon }) => (
          <div key={title} className="group border border-white/10 bg-[#1A1A1A] p-5 transition-all hover:border-[#FF6B00]/50 hover:-translate-y-0.5">
            <Icon size={18} className="text-[#FF6B00] mb-4" />
            <p className="font-display text-white text-sm tracking-widest font-bold">{title}</p>
            <p className="font-body text-[#666] text-xs leading-relaxed mt-2">{detail}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["stripe", "inventory", "orders", "customers", "analytics", "environment", "theme", "automation"] as AdminTab[]).map((id) => (
          <button key={id} onClick={() => onSelect(id)} className="admin-btn-secondary text-xs py-3 uppercase">
            {id}
          </button>
        ))}
      </div>
    </div>
  );
}

function ControlCenterTab({ area }: { area: keyof typeof controlAreas }) {
  const config = controlAreas[area];
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((settings) => {
        const next: Record<string, string> = {};
        config.fields.forEach((field) => { next[field.key] = settings[field.key] || ""; });
        setForm(next);
      })
      .catch(() => {});
  }, [config]);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(form);
      toast.success(`${config.title} saved`);
    } catch {
      toast.error("Failed to save controls");
    } finally {
      setSaving(false);
    }
  };

  const Icon = config.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label">{config.eyebrow}</p>
          <h1 className="font-display text-white font-bold tracking-widest text-lg flex items-center gap-2">
            <Icon size={16} className="text-[#FF6B00]" /> {config.title.toUpperCase()}
          </h1>
          <p className="font-body text-[#666] text-sm mt-2 max-w-2xl">{config.description}</p>
        </div>
        <button onClick={save} disabled={saving} className="admin-btn-primary flex items-center gap-2 text-xs">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          SAVE
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {config.fields.map((field) => (
          <div key={field.key} className={field.type === "textarea" ? "lg:col-span-2" : ""}>
            <label className="font-display text-[#888] text-[10px] tracking-widest block mb-1.5">{field.label}</label>
            {field.type === "select" ? (
              <select
                value={form[field.key] || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                className="w-full bg-[#111] border border-white/10 text-white font-body text-xs px-3 py-2.5 outline-none focus:border-[#FF6B00]"
              >
                <option value="">Select...</option>
                {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                value={form[field.key] || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                placeholder={field.placeholder}
                rows={5}
                className="w-full bg-[#111] border border-white/10 text-white font-body text-xs px-3 py-2.5 outline-none focus:border-[#FF6B00] resize-y"
              />
            ) : (
              <input
                value={form[field.key] || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                placeholder={field.placeholder}
                className="w-full bg-[#111] border border-white/10 text-white font-body text-xs px-3 py-2.5 outline-none focus:border-[#FF6B00]"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Admin Panel ─────────────────────────────────────────────────────────

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<(ProductFormData & { id?: number }) | null>(null);

  const [productList, setProductList] = useState<Product[]>([]);
  const [productSaving, setProductSaving] = useState(false);
  const [productDeleting, setProductDeleting] = useState<number | null>(null);

  const loadProducts = useCallback(async () => {
    try { setProductList(await listProducts()); } catch { toast.error("Failed to load products"); }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleSave = async (form: ProductFormData & { id?: number }) => {
    const data = {
      name: form.name,
      description: form.description || undefined,
      price: String(parseFloat(form.price)),
      compareAtPrice: form.compareAtPrice ? String(parseFloat(form.compareAtPrice)) : undefined,
      category: form.category,
      sizes: form.sizes.split(",").map((s) => s.trim()).filter(Boolean),
      imageUrl: form.imageUrl || undefined,
      badge: form.badge || undefined,
      inStock: form.inStock,
      published: form.published,
      hidden: form.hidden,
      delisted: form.delisted,
      featured: form.featured,
      sortOrder: parseInt(form.sortOrder) || 0,
      shopifyVariantId: form.shopifyVariantId || undefined,
      shopifyProductId: form.shopifyProductId || undefined,
      printifyProductId: form.printifyProductId || undefined,
    };
    setProductSaving(true);
    try {
      if (form.id) {
        await updateProduct(form.id, data);
        toast.success("Product updated!"); setEditProduct(null);
      } else {
        await createProduct(data);
        toast.success("Product created!"); setShowModal(false);
      }
      await loadProducts();
    } catch { toast.error("Failed to save product"); }
    finally { setProductSaving(false); }
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
      published: (p as any).published ?? false,
      hidden: (p as any).hidden ?? false,
      delisted: (p as any).delisted ?? false,
      featured: p.featured ?? false,
      sortOrder: String(p.sortOrder),
      shopifyVariantId: p.shopifyVariantId || "",
      shopifyProductId: p.shopifyProductId || "",
      printifyProductId: p.printifyProductId || "",
      imageUrl: p.imageUrl || "",
    });
  };

  const confirmDelete = async (id: number, name: string) => {
    if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      setProductDeleting(id);
      try { await deleteProduct(id); toast.success("Product deleted"); await loadProducts(); }
      catch { toast.error("Failed to delete product"); }
      finally { setProductDeleting(null); }
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
        <div className="border-b border-white/10 px-6 flex gap-0 overflow-x-auto">
          {[
            { id: "overview", label: "OVERVIEW", icon: BarChart3 },
            { id: "products", label: "PRODUCTS", icon: Package },
            { id: "inventory", label: "INVENTORY", icon: Boxes },
            { id: "orders", label: "ORDERS", icon: ShoppingBag },
            { id: "customers", label: "CUSTOMERS", icon: Users },
            { id: "analytics", label: "ANALYTICS", icon: BarChart3 },
            { id: "blog", label: "BLOG", icon: BookOpen },
            { id: "digital", label: "DIGITAL", icon: Download },
            { id: "videos", label: "AI VIDEOS", icon: Video },
            { id: "affiliate", label: "AFFILIATE", icon: Link2 },
            { id: "membership", label: "MEMBERSHIP", icon: Users },
            { id: "printify", label: "PRINTIFY", icon: Printer },
            { id: "shopify", label: "SHOPIFY", icon: ShoppingBag },
            { id: "stripe", label: "STRIPE", icon: CreditCard },
            { id: "tidio", label: "TIDIO", icon: MessageSquare },
            { id: "aichat", label: "AI CHAT", icon: MessageSquare },
            { id: "environment", label: "API/ENV", icon: Database },
            { id: "theme", label: "THEME", icon: Palette },
            { id: "notifications", label: "ALERTS", icon: Bell },
            { id: "automation", label: "AUTOMATION", icon: Workflow },
            { id: "settings", label: "SETTINGS", icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as AdminTab)}
              className={`flex shrink-0 items-center gap-2 px-5 py-4 font-display text-xs font-bold tracking-widest border-b-2 transition-colors ${
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
          {tab === "overview" && <OverviewTab onSelect={setTab} />}

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
                {productList.map((p: any) => {
                  const pAny = p as any;
                  const isPublished = pAny.published ?? false;
                  const isHidden = pAny.hidden ?? false;
                  const isDelisted = pAny.delisted ?? false;
                  const isOutOfStock = !p.inStock;

                  const quickToggle = async (field: string, value: boolean) => {
                    try { await updateProduct(p.id, { [field]: value } as any); toast.success("Product updated"); await loadProducts(); }
                    catch { toast.error("Update failed"); }
                  };

                  return (
                    <div key={p.id} className={`bg-[#1A1A1A] border overflow-hidden ${
                      isDelisted ? "border-red-500/40" : isHidden ? "border-yellow-500/30" : isPublished ? "border-green-500/30" : "border-white/10"
                    }`}>
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
                        {isDelisted && (
                          <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center">
                            <span className="font-display text-red-300 text-xs tracking-widest">DELISTED</span>
                          </div>
                        )}
                        {!isDelisted && isOutOfStock && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span className="font-display text-white text-xs tracking-widest">OUT OF STOCK</span>
                          </div>
                        )}
                        {!isDelisted && !isOutOfStock && isHidden && (
                          <div className="absolute top-0 right-0 bg-yellow-500/80 px-2 py-1">
                            <span className="font-display text-black text-[9px] tracking-widest">HIDDEN</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="font-display text-white text-sm font-bold tracking-wider leading-tight">{p.name}</p>
                          {p.featured && <Star size={12} className="text-[#FF6B00] flex-shrink-0 mt-0.5" fill="#FF6B00" />}
                        </div>
                        <p className="font-body text-[#888] text-xs mb-2">{p.category}</p>

                        {/* Status badges */}
                        <div className="flex flex-wrap gap-1 mb-3">
                          <span className={`font-display text-[9px] tracking-widest px-2 py-0.5 ${
                            isPublished ? "bg-green-500/20 text-green-400" : "bg-white/5 text-[#555]"
                          }`}>{isPublished ? "PUBLISHED" : "DRAFT"}</span>
                          {isOutOfStock && <span className="font-display text-[9px] tracking-widest px-2 py-0.5 bg-orange-500/20 text-orange-400">OUT OF STOCK</span>}
                          {isHidden && <span className="font-display text-[9px] tracking-widest px-2 py-0.5 bg-yellow-500/20 text-yellow-400">HIDDEN</span>}
                          {isDelisted && <span className="font-display text-[9px] tracking-widest px-2 py-0.5 bg-red-500/20 text-red-400">DELISTED</span>}
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <span className="font-display text-[#FF6B00] font-bold text-sm">${Number(p.price).toFixed(2)}</span>
                          {p.compareAtPrice && (
                            <span className="font-body text-[#555] text-xs line-through">${Number(p.compareAtPrice).toFixed(2)}</span>
                          )}
                        </div>

                        {/* Quick-action toggles */}
                        <div className="flex flex-wrap gap-1 mb-3">
                          <button
                            onClick={() => quickToggle("published", !isPublished)}
                            className={`text-[9px] font-display tracking-widest px-2 py-1 border transition-colors ${
                              isPublished ? "border-green-500/50 text-green-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50" : "border-white/10 text-[#555] hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/50"
                            }`}
                          >{isPublished ? "UNPUBLISH" : "PUBLISH"}</button>
                          <button
                            onClick={() => quickToggle("inStock", !isOutOfStock)}
                            className={`text-[9px] font-display tracking-widest px-2 py-1 border transition-colors ${
                              isOutOfStock ? "border-orange-500/50 text-orange-400 hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/50" : "border-white/10 text-[#555] hover:bg-orange-500/10 hover:text-orange-400 hover:border-orange-500/50"
                            }`}
                          >{isOutOfStock ? "MARK IN STOCK" : "OUT OF STOCK"}</button>
                          <button
                            onClick={() => quickToggle("hidden", !isHidden)}
                            className={`text-[9px] font-display tracking-widest px-2 py-1 border transition-colors ${
                              isHidden ? "border-yellow-500/50 text-yellow-400 hover:border-white/10 hover:text-[#555]" : "border-white/10 text-[#555] hover:bg-yellow-500/10 hover:text-yellow-400 hover:border-yellow-500/50"
                            }`}
                          >{isHidden ? "UNHIDE" : "HIDE"}</button>
                          <button
                            onClick={() => quickToggle("delisted", !isDelisted)}
                            className={`text-[9px] font-display tracking-widest px-2 py-1 border transition-colors ${
                              isDelisted ? "border-red-500/50 text-red-400 hover:border-white/10 hover:text-[#555]" : "border-white/10 text-[#555] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50"
                            }`}
                          >{isDelisted ? "RELIST" : "DELIST"}</button>
                        </div>

                        {/* Edit / Delete */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(p)}
                            className="flex-1 admin-btn-secondary flex items-center justify-center gap-1.5 text-xs"
                          >
                            <Pencil size={11} /> Edit
                          </button>
                          <button
                            onClick={() => confirmDelete(p.id, p.name)}
                            disabled={productDeleting === p.id}
                            className="admin-btn-danger flex items-center justify-center gap-1.5 text-xs px-3"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "inventory" && <ControlCenterTab area="inventory" />}
          {tab === "orders" && <ControlCenterTab area="orders" />}
          {tab === "customers" && <ControlCenterTab area="customers" />}
          {tab === "analytics" && <ControlCenterTab area="analytics" />}
          {tab === "settings" && <SettingsTab />}
          {tab === "blog" && <BlogTab />}
          {tab === "digital" && <DigitalTab />}
          {tab === "videos" && <AIVideosTab />}
          {tab === "affiliate" && <AffiliateTab />}
          {tab === "membership" && <MembershipTab />}
          {tab === "printify" && <PrintifyTab />}
          {tab === "shopify" && <ShopifyTab />}
          {tab === "stripe" && <ControlCenterTab area="stripe" />}
          {tab === "tidio" && <ControlCenterTab area="tidio" />}
          {tab === "aichat" && <AIChatTab />}
          {tab === "environment" && <ControlCenterTab area="environment" />}
          {tab === "theme" && <ControlCenterTab area="theme" />}
          {tab === "notifications" && <ControlCenterTab area="notifications" />}
          {tab === "automation" && <ControlCenterTab area="automation" />}
        </div>

        {/* Add Product Modal */}
        {showModal && (
          <ProductModal
            initial={EMPTY_FORM}
            onClose={() => setShowModal(false)}
            onSave={handleSave}
            isLoading={productSaving}
          />
        )}

        {/* Edit Product Modal */}
        {editProduct && (
          <ProductModal
            initial={editProduct}
            onClose={() => setEditProduct(null)}
            onSave={handleSave}
            isLoading={productSaving}
          />
        )}
      </div>
    </AdminGuard>
  );
}
