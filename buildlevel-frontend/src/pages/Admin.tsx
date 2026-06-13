import { useState, useEffect } from "react";
import { adminApi, Product, BlogPost, DigitalProduct, MaintenanceConfig, ShopAudience, ShopCategory, ShopTaxonomy } from "../lib/api";
import AdminIntegrationsPanel from "../components/AdminIntegrationsPanel";
import AdminModerationPanel from "../components/AdminModerationPanel";
import AdminFulfillmentPanel from "../components/AdminFulfillmentPanel";
import AdminSubscribersPanel from "../components/AdminSubscribersPanel";
import AdminAbandonedCartsPanel from "../components/AdminAbandonedCartsPanel";
import AdminEmailCampaignsPanel from "../components/AdminEmailCampaignsPanel";
import AdminShopOrganizationPanel from "../components/AdminShopOrganizationPanel";
import AdminSupportPanel from "../components/AdminSupportPanel";
import {
  APPAREL_AUDIENCES,
  DEFAULT_AUDIENCE,
  DEFAULT_CATEGORY,
  getAudienceForCategory,
  getCategoriesForAudience,
  getCategoryAudienceLabel,
  getCategoryLabel,
  getCategoryBySlug,
  createCustomCategorySlug,
  type ApparelAudience,
} from "../lib/apparelCategories";
import { BLOG_CATEGORIES, DEFAULT_BLOG_CATEGORY, getBlogCategoryLabel, normalizeBlogCategory } from "../lib/blogCategories";

type Tab = "products" | "digital" | "blog" | "shop-org" | "integrations" | "fulfillment" | "support" | "abandoned" | "subscribers" | "campaigns" | "moderation" | "maintenance";

const adminNavGroups: Array<{ label: string; items: Array<{ tab: Tab; label: string }> }> = [
  { label: "Products & Content", items: [{ tab: "products", label: "Apparel" }, { tab: "digital", label: "Digital" }, { tab: "blog", label: "Blog" }, { tab: "shop-org", label: "Shop Navigation" }] },
  { label: "Operations", items: [{ tab: "integrations", label: "Integrations" }, { tab: "fulfillment", label: "Fulfillment" }, { tab: "support", label: "Customer Support" }, { tab: "abandoned", label: "Abandoned Carts" }] },
  { label: "Marketing & Community", items: [{ tab: "subscribers", label: "Subscribers" }, { tab: "campaigns", label: "Email Campaigns" }, { tab: "moderation", label: "Moderation" }] },
  { label: "System", items: [{ tab: "maintenance", label: "Maintenance" }] },
];

const adminTabLabel = (tab: Tab) => adminNavGroups.flatMap(group => group.items).find(item => item.tab === tab)?.label || "Admin";

const defaultMaintenanceConfig: MaintenanceConfig = {
  enabled: false,
  title: "Coming Back Soon",
  message: "BUILD LEVEL is upgrading the experience. The storefront will return shortly.",
  returnText: "Discipline. Focus. Execution.",
  contactEmail: "info@thebuildlevel.com",
};

type DigitalUploadConfig = {
  maxDigitalFileSizeBytes: number;
  allowedFileTypes: string[];
  allowedThumbnailTypes: string[];
  storage: { configured: boolean; provider: string };
};

type ProductVariantRow = {
  label: string;
  price: string;
  variantId?: string;
  raw?: string;
};

const storageImageUrl = (value?: string | null) => {
  if (!value) return "";
  if (value.startsWith("storage:")) {
    return `/api/digital/thumbnail/${encodeURIComponent(value.slice("storage:".length))}`;
  }
  return value;
};

const isStoredImageValue = (value: string) =>
  /^https?:\/\//i.test(value) || value.startsWith("data:image/") || value.startsWith("storage:");

const getProductImages = (imageUrl?: string | null) => {
  if (!imageUrl) return [];
  const trimmed = imageUrl.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((url): url is string => typeof url === "string" && isStoredImageValue(url));
    } catch {
      return [];
    }
  }
  return isStoredImageValue(trimmed) ? [trimmed] : [];
};

const getProductCoverImage = (imageUrl?: string | null) => getProductImages(imageUrl)[0] || "";

const serializeProductImages = (images: string[]) => {
  const unique = Array.from(new Set(images.map(image => image.trim()).filter(Boolean)));
  return unique.length <= 1 ? (unique[0] || "") : JSON.stringify(unique);
};

const getProductOptionLabel = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return String(parsed?.label || value);
    } catch {
      const labelMatch = trimmed.match(/"label"\s*:\s*"([^"]+)/i);
      return labelMatch?.[1] || "";
    }
  }
  if (/^"?variantId"?\s*:/i.test(trimmed) || /^"?price"?\s*:/i.test(trimmed)) return "";
  return trimmed.replace(/^"+|"+$/g, "");
};

const parseProductVariantRow = (value: string, fallbackPrice = ""): ProductVariantRow | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^"?variantId"?\s*:/i.test(trimmed) || /^"?price"?\s*:/i.test(trimmed)) return null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const label = String(parsed?.label || "").trim();
      if (!label) return null;
      return {
        label,
        price: parsed?.price ? String(parsed.price) : fallbackPrice,
        variantId: parsed?.variantId ? String(parsed.variantId) : undefined,
        raw: value,
      };
    } catch {
      const labelMatch = trimmed.match(/"label"\s*:\s*"([^"]+)/i);
      if (!labelMatch?.[1]) return null;
      return { label: labelMatch[1], price: fallbackPrice, raw: value };
    }
  }

  const label = trimmed.replace(/^"+|"+$/g, "");
  return label ? { label, price: fallbackPrice, raw: value } : null;
};

const getProductVariantRows = (sizes?: string[], fallbackPrice = "") =>
  (Array.isArray(sizes) ? sizes : [])
    .map(size => parseProductVariantRow(size, fallbackPrice))
    .filter((row): row is ProductVariantRow => !!row && !!row.label);

const serializeProductVariantRows = (rows: ProductVariantRow[]) =>
  rows
    .map(row => ({
      label: row.label.trim(),
      variantId: row.variantId,
      price: row.price ? String(row.price).trim() : undefined,
    }))
    .filter(row => row.label)
    .map(row => row.variantId || row.price ? JSON.stringify(row) : row.label);

const getDisplaySizes = (sizes?: string[]) =>
  (Array.isArray(sizes) ? sizes : []).map(getProductOptionLabel).filter(Boolean).join(", ");

const isLaunchBadge = (value?: string | null) => {
  const badge = (value || "").trim().toLowerCase();
  return badge === "coming soon" || badge === "new release" || badge === "limited edition" || badge === "featured";
};

const statusBadgeFor = (status: string) =>
  status === "coming-soon" ? "Coming Soon" :
  status === "new-release" ? "New Release" :
  status === "limited-edition" ? "Limited Edition" :
  "";

const DIRECT_SERVER_UPLOAD_RECOMMENDED_MAX_BYTES = 95 * 1024 * 1024;
const DIGITAL_FILE_TYPE_EXAMPLES = "PDF, ZIP, MP3, M4A, WAV, MP4, MOV, PNG, JPG, DOCX, PPTX, XLSX";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<Tab>("products");
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [digital, setDigital] = useState<DigitalProduct[]>([]);
  const [blog, setBlog] = useState<BlogPost[]>([]);
  const [shopTaxonomy, setShopTaxonomy] = useState<ShopTaxonomy>({ audiences: [], categories: [], productAssignments: [] });
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceConfig>(defaultMaintenanceConfig);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  // Product form
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [productForm, setProductForm] = useState({ name: "", description: "", price: "", compareAtPrice: "", audience: DEFAULT_AUDIENCE as string, category: DEFAULT_CATEGORY, sizes: "", imageUrl: "", badge: "", status: "available", inStock: true, published: true, featured: false });
  const [customProductCategory, setCustomProductCategory] = useState("");
  const [productImagePreviews, setProductImagePreviews] = useState<string[]>([]);
  const [productVariantRows, setProductVariantRows] = useState<ProductVariantRow[]>([]);

  // Digital form
  const [showDigitalForm, setShowDigitalForm] = useState(false);
  const [editDigital, setEditDigital] = useState<Partial<DigitalProduct> | null>(null);
  const [digitalForm, setDigitalForm] = useState({ name: "", description: "", price: "", category: "mindset", productType: "pdf" as "pdf"|"audiobook"|"video"|"other", imageUrl: "", fileKey: "", fileUrl: "", fileName: "", badge: "", stripePaymentLink: "", duration: "", version: "1.0", downloadLimit: "5", accessExpiresDays: "30", published: true, scheduledAt: "" });
  const [digitalUploadProgress, setDigitalUploadProgress] = useState(0);
  const [thumbnailUploadProgress, setThumbnailUploadProgress] = useState(0);
  const [thumbnailPreviews, setThumbnailPreviews] = useState<string[]>([]);
  const [digitalFileInfo, setDigitalFileInfo] = useState<{ name: string; size: number; mimeType: string } | null>(null);
  const [digitalUploadConfig, setDigitalUploadConfig] = useState<DigitalUploadConfig | null>(null);

  // Blog form
  const [showBlogForm, setShowBlogForm] = useState(false);
  const [editBlog, setEditBlog] = useState<Partial<BlogPost> | null>(null);
  const [blogForm, setBlogForm] = useState({ title: "", slug: "", excerpt: "", content: "", imageUrl: "", category: DEFAULT_BLOG_CATEGORY, readTime: "", published: true, scheduledAt: "", featured: false });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const enabledAudienceOptions = () => {
    const dynamic = shopTaxonomy.audiences.filter(a => Boolean(a.enabled) && !Boolean(a.isForYou || false) || a.slug === "for-you");
    return dynamic.length ? dynamic : APPAREL_AUDIENCES.map(a => ({ id: 0, slug: a.value, name: a.label, enabled: true, hidden: false, featured: false, published: true, displayOrder: 0 }));
  };
  const getAudienceIdBySlug = (slug: string) => shopTaxonomy.audiences.find(a => a.slug === slug)?.id || 0;
  const dynamicCategoriesForAudience = (audienceSlug: string) => {
    const audienceId = getAudienceIdBySlug(audienceSlug);
    const dynamic = shopTaxonomy.categories.filter(c => Number(c.audienceId) === Number(audienceId) && Boolean(c.enabled) && !Boolean(c.hidden));
    return dynamic.length ? dynamic.map(c => ({ slug: c.slug, label: c.name, id: c.id })) : getCategoriesForAudience(audienceSlug as ApparelAudience).map(c => ({ slug: c.slug, label: c.label, id: 0 }));
  };
  const assignmentForProduct = (productId?: number) => (shopTaxonomy.productAssignments || []).filter(row => Number(row.productId) === Number(productId));

  const isKnownCategoryForAudience = (audience: string, category: string) =>
    dynamicCategoriesForAudience(audience).some(item => item.slug === category);

  const ensureProductCategoryId = async (audienceId: number) => {
    const existing = shopTaxonomy.categories.find(c => c.slug === productForm.category && Number(c.audienceId) === Number(audienceId));
    if (existing?.id) return existing.id;
    const customName = (customProductCategory || getCategoryLabel(productForm.category) || productForm.category).trim();
    if (!customName) return 0;
    await adminApi.createShopCategory({
      audienceId,
      name: customName,
      slug: productForm.category,
      categoryType: "category",
      enabled: true,
      hidden: false,
      published: true,
    } as any);
    const taxonomy = await adminApi.getShopTaxonomy();
    setShopTaxonomy({
      audiences: Array.from(new Map<string, ShopAudience>(taxonomy.audiences.map(item => [item.slug, item] as [string, ShopAudience])).values()),
      categories: Array.from(new Map<string, ShopCategory>(taxonomy.categories.map(item => [`${item.audienceId}:${item.parentId || 0}:${item.slug}`, item] as [string, ShopCategory])).values()),
      productAssignments: taxonomy.productAssignments || [],
    });
    return taxonomy.categories.find(c => c.slug === productForm.category && Number(c.audienceId) === Number(audienceId))?.id || 0;
  };

  const logout = async () => {
    if (!window.confirm("Are you sure you want to log out of the Build Level Admin Panel?")) return;
    await adminApi.logout().catch(() => undefined);
    setAuthed(false);
    setPassword("");
    setAdminMenuOpen(false);
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await adminApi.login(password);
      if (result.success !== true) throw new Error("Invalid login response");
      setAuthed(true);
      loadData();
    } catch {
      setLoginError("Invalid password");
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, d, b, maintenance, taxonomy] = await Promise.all([
        adminApi.getProducts(),
        adminApi.getDigitalProducts(),
        adminApi.getBlogPosts(),
        adminApi.getMaintenanceSettings().catch(() => defaultMaintenanceConfig),
        adminApi.getShopTaxonomy().catch(() => ({ audiences: [], categories: [], productAssignments: [] })),
      ]);
      setProducts(p); setDigital(d); setBlog(b);
      setMaintenanceForm({ ...defaultMaintenanceConfig, ...maintenance });
      setShopTaxonomy({
        audiences: Array.from(new Map<string, ShopAudience>(taxonomy.audiences.map(item => [item.slug, item] as [string, ShopAudience])).values()),
        categories: Array.from(new Map<string, ShopCategory>(taxonomy.categories.map(item => [`${item.audienceId}:${item.parentId || 0}:${item.slug}`, item] as [string, ShopCategory])).values()),
        productAssignments: taxonomy.productAssignments || [],
      });
    } catch { }
    adminApi.getDigitalUploadConfig().then(setDigitalUploadConfig).catch(() => setDigitalUploadConfig(null));
    setLoading(false);
  };

  useEffect(() => {
    adminApi.me().then((result) => {
      if (result.admin === true) {
        setAuthed(true);
        loadData();
      }
    }).catch(() => setAuthed(false));
  }, []);

  // Product CRUD
  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const { audience: _audience, ...productPayload } = productForm;
    const syncedProduct = !!(editProduct?.printifyProductId || editProduct?.shopifyProductId);
    const editedSyncedSizes = serializeProductVariantRows(productVariantRows);
    const data = {
      ...productPayload,
      price: parseFloat(productForm.price),
      compareAtPrice: productForm.compareAtPrice ? parseFloat(productForm.compareAtPrice) : undefined,
      sizes: syncedProduct && editedSyncedSizes.length > 0
        ? editedSyncedSizes
        : productForm.sizes.split(",").map(s => s.trim()).filter(Boolean),
    };
    try {
      const productImages = getProductImages(data.imageUrl);
      const statusBadge = statusBadgeFor(data.status);
      data.badge = statusBadge || (data.status === "available" && isLaunchBadge(data.badge) ? "" : data.badge);
      data.inStock = data.status === "coming-soon" ? false : data.inStock;
      if (!data.published) {
        (data as any).hidden = true;
        data.inStock = false;
        data.featured = false;
      } else {
        (data as any).hidden = false;
        (data as any).delisted = false;
      }
      delete (data as any).status;
      if (!data.name.trim()) throw new Error("Product name is required");
      if (!Number.isFinite(data.price) || data.price <= 0) throw new Error("Product price must be greater than 0");
      if (!data.category.trim()) throw new Error("Product category is required");
      if (data.imageUrl && data.imageUrl.length > 1_500_000) {
        throw new Error("Image gallery is too large. Upload fewer/smaller images or use image URLs.");
      }
      if (productImages.length > 0) {
        data.imageUrl = serializeProductImages(productImages);
      }
      const saved = editProduct?.id ? await adminApi.updateProduct(editProduct.id, data as any).then(() => ({ id: editProduct.id })) : await adminApi.createProduct(data as any);
      const savedProductId = Number(saved?.id || editProduct?.id || 0);
      const audienceId = getAudienceIdBySlug(productForm.audience);
      const categoryId = audienceId ? await ensureProductCategoryId(audienceId) : 0;
      if (savedProductId && audienceId) await adminApi.updateProductClassification(savedProductId, { audienceId, categoryId: categoryId || undefined }).catch(() => undefined);
      showToast(data.published ? (editProduct?.id ? "Product updated and visible if qualified" : "Product created and visible if qualified") : "Product saved as draft");
      setShowProductForm(false); setEditProduct(null);
      setCustomProductCategory("");
      setProductImagePreviews([]);
      setProductVariantRows([]);
      loadData();
    } catch (error: any) {
      showToast(error?.response?.data?.error || error?.message || "Error saving product");
    }
  };

  const compressImageFile = (file: File, maxDataUrlLength = 55_000) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let maxSide = 720;
        let quality = 0.72;
        let output = "";

        for (let attempt = 0; attempt < 8; attempt += 1) {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Could not process image"));
            return;
          }
          context.clearRect(0, 0, width, height);
          context.drawImage(img, 0, 0, width, height);
          output = canvas.toDataURL("image/jpeg", quality);
          if (output.length <= maxDataUrlLength) break;
          maxSide = Math.max(360, Math.round(maxSide * 0.78));
          quality = Math.max(0.5, quality - 0.08);
        }

        if (output.length > maxDataUrlLength) {
          reject(new Error("Image is still too large. Use a smaller image or image URL."));
          return;
        }

        resolve(output);
      };
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read image"));
    reader.readAsDataURL(file);
  });

  const handleProductImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(file => file.type.startsWith("image/"));
    let storedImages: string[] = [];
    if (digitalUploadConfig?.storage.configured) {
      try {
        const uploaded = await Promise.all(imageFiles.slice(0, 12).map(file => adminApi.uploadDigitalAsset(file, "thumbnail")));
        storedImages = uploaded.map(file => file.url || `storage:${file.key}`);
      } catch {
        storedImages = [];
        showToast("Storage upload failed. Saving compressed images in product record.");
      }
    }
    if (storedImages.length === 0) {
      const perImageLimit = Math.max(8_000, Math.floor(56_000 / Math.max(1, Math.min(imageFiles.length, 4))));
      storedImages = await Promise.all(imageFiles.slice(0, 4).map(file => compressImageFile(file, perImageLimit)));
    }
    setProductImagePreviews(storedImages);
    if (storedImages[0]) setProductForm(f => ({ ...f, imageUrl: serializeProductImages(storedImages) }));
    showToast(`${storedImages.length} image${storedImages.length === 1 ? "" : "s"} ready — tap Save Product to publish`);
  };

  const deleteProduct = async (id: number) => {
    if (!confirm("Delete this product?")) return;
    await adminApi.deleteProduct(id); loadData(); showToast("Deleted");
  };

  const openEditProduct = (p: Product) => {
    const assigned = assignmentForProduct(p.id);
    const audience = assigned[0]?.audienceSlug || getAudienceForCategory(p.category);
    const category = assigned.find(row => row.assignmentType === "primary")?.categorySlug || p.category || dynamicCategoriesForAudience(audience)[0]?.slug || DEFAULT_CATEGORY;
    const badge = (p.badge || "").toLowerCase();
    const status = badge.includes("coming") || badge.includes("soon") ? "coming-soon" : badge.includes("limited") ? "limited-edition" : badge.includes("new") ? "new-release" : "available";
    setEditProduct(p);
    setProductForm({ name: p.name, description: p.description || "", price: p.price, compareAtPrice: p.compareAtPrice || "", audience, category, sizes: getDisplaySizes(p.sizes), imageUrl: p.imageUrl || "", badge: p.badge || "", status, inStock: p.inStock, published: p.published, featured: p.featured });
    setCustomProductCategory(getCategoryBySlug(category) || shopTaxonomy.categories.some(c => c.slug === category) ? "" : getCategoryLabel(category));
    setProductVariantRows(getProductVariantRows(p.sizes, p.price));
    setProductImagePreviews(getProductImages(p.imageUrl));
    setShowProductForm(true);
  };

  // Digital CRUD
  const toDigitalDatetimeLocalValue = (value?: string | Date | null) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };
  const defaultDigitalScheduleAtMidnight = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return toDigitalDatetimeLocalValue(date);
  };
  const toDigitalSchedulePayload = (value: string) => value ? new Date(value).toISOString() : null;
  const getDigitalStatus = (product: DigitalProduct): { label: string; tone: "published" | "scheduled" | "draft"; detail?: string } => {
    if (product.published) return { label: "Published", tone: "published" };
    if (product.scheduledAt) {
      const scheduled = new Date(product.scheduledAt);
      if (!Number.isNaN(scheduled.getTime())) {
        if (scheduled <= new Date()) return { label: "Published", tone: "published" };
        return { label: "Scheduled", tone: "scheduled", detail: scheduled.toLocaleString() };
      }
    }
    return { label: "Draft", tone: "draft" };
  };
  const saveDigital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (digitalUploadProgress > 0 && digitalUploadProgress < 100) {
      showToast("Please wait until the digital file finishes uploading before saving.");
      return;
    }
    const { version: _version, ...digitalPayload } = digitalForm;
    const data = {
      ...digitalPayload,
      price: parseFloat(digitalForm.price),
      downloadLimit: Number.parseInt(digitalForm.downloadLimit, 10) || 5,
      accessExpiresDays: Number.parseInt(digitalForm.accessExpiresDays, 10) || 30,
      scheduledAt: digitalForm.published ? null : toDigitalSchedulePayload(digitalForm.scheduledAt),
    };
    try {
      if (editDigital?.id) await adminApi.updateDigitalProduct(editDigital.id, data as any);
      else await adminApi.createDigitalProduct(data as any);
      showToast(digitalForm.published ? (editDigital?.id ? "Updated and published!" : "Created and published!") : digitalForm.scheduledAt ? "Digital product scheduled!" : (editDigital?.id ? "Draft updated!" : "Draft created!"));
      setShowDigitalForm(false); setEditDigital(null); setDigitalUploadProgress(0); setThumbnailUploadProgress(0); setThumbnailPreviews([]); setDigitalFileInfo(null); loadData();
    } catch (error: any) { showToast(error?.response?.data?.error || "Error saving"); }
  };

  const openEditDigital = (p: DigitalProduct) => {
    setEditDigital(p);
    setDigitalForm({ name: p.name, description: p.description || "", price: p.price, category: p.category, productType: p.productType, imageUrl: p.imageUrl || "", fileKey: p.fileKey || "", fileUrl: p.fileUrl || "", fileName: p.fileName || "", badge: p.badge || "", stripePaymentLink: p.stripePaymentLink || "", duration: p.duration || "", version: "1.0", downloadLimit: String(p.downloadLimit || 5), accessExpiresDays: String(p.accessExpiresDays || 30), published: p.published, scheduledAt: toDigitalDatetimeLocalValue(p.scheduledAt) });
    setThumbnailPreviews(p.imageUrl ? [p.imageUrl] : []);
    setDigitalFileInfo((p.fileName || p.fileKey || p.fileUrl) ? { name: p.fileName || "Stored digital upload", size: 0, mimeType: "Stored file" } : null);
    setShowDigitalForm(true);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "Stored";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  };

  const uploadDigitalFile = async (file: File) => {
    if (file.size > DIRECT_SERVER_UPLOAD_RECOMMENDED_MAX_BYTES) {
      setDigitalUploadProgress(0);
      showToast(`This file is ${formatBytes(file.size)}. Large videos must be uploaded directly to R2/S3 or pasted as a Digital File URL.`);
      return;
    }
    if (digitalUploadConfig?.storage.configured === false) {
      setDigitalUploadProgress(0);
      showToast("Digital file upload needs R2/S3 storage env vars on Render. Add a hosted File URL below for now.");
      return;
    }
    if (digitalUploadConfig?.maxDigitalFileSizeBytes && file.size > digitalUploadConfig.maxDigitalFileSizeBytes) {
      setDigitalUploadProgress(0);
      showToast(`Video/file is too large. Max upload is ${formatBytes(digitalUploadConfig.maxDigitalFileSizeBytes)}.`);
      return;
    }
    setDigitalUploadProgress(1);
    try {
      const uploaded = await adminApi.uploadDigitalAsset(file, "digital", setDigitalUploadProgress);
      setDigitalForm(f => ({ ...f, fileKey: uploaded.key, fileUrl: uploaded.url, fileName: uploaded.fileName }));
      setDigitalFileInfo({ name: uploaded.fileName, size: uploaded.size, mimeType: uploaded.mimeType });
      setDigitalUploadProgress(100);
      showToast("Digital file uploaded");
    } catch (error: any) {
      setDigitalUploadProgress(0);
      showToast(error?.response?.data?.error || "Upload storage is not configured on Render. Add R2/S3 upload env vars for digital files.");
    }
  };

  const uploadThumbnails = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    setThumbnailUploadProgress(1);
    const previews: string[] = [];
    try {
      for (let index = 0; index < imageFiles.length; index += 1) {
        const uploaded = await adminApi.uploadDigitalAsset(imageFiles[index], "thumbnail", progress => {
          const weighted = Math.round(((index + progress / 100) / imageFiles.length) * 100);
          setThumbnailUploadProgress(weighted);
        });
        const storedImageUrl = uploaded.url || `storage:${uploaded.key}`;
        previews.push(storedImageUrl);
        if (index === 0) setDigitalForm(f => ({ ...f, imageUrl: storedImageUrl }));
      }
      setThumbnailPreviews(previews);
      setThumbnailUploadProgress(100);
      showToast("Thumbnails uploaded");
    } catch (error: any) {
      try {
        const fallbackPreviews = await Promise.all(imageFiles.slice(0, 4).map(compressImageFile));
        setThumbnailPreviews(fallbackPreviews);
        if (fallbackPreviews[0]) setDigitalForm(f => ({ ...f, imageUrl: fallbackPreviews[0] }));
        setThumbnailUploadProgress(100);
        showToast("Thumbnail saved in product record. Configure upload storage for digital files.");
      } catch {
        setThumbnailUploadProgress(0);
        showToast(error?.response?.data?.error || "Thumbnail upload needs storage configuration");
      }
    }
  };

  // Blog CRUD
  const toDatetimeLocalValue = (value?: string | Date | null) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };
  const defaultScheduleAtMidnight = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return toDatetimeLocalValue(date);
  };
  const toSchedulePayload = (value: string) => value ? new Date(value).toISOString() : null;
  const getBlogStatus = (post: BlogPost): { label: string; tone: "published" | "scheduled" | "draft"; detail?: string } => {
    if (post.published) return { label: "Published", tone: "published" };
    if (post.scheduledAt) {
      const scheduled = new Date(post.scheduledAt);
      if (!Number.isNaN(scheduled.getTime())) {
        if (scheduled <= new Date()) return { label: "Published", tone: "published" };
        return { label: "Scheduled", tone: "scheduled", detail: scheduled.toLocaleString() };
      }
    }
    return { label: "Draft", tone: "draft" };
  };
  const blogStatusStyle = (tone: "published" | "scheduled" | "draft"): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    border: `1px solid ${tone === "published" ? "#22c55e" : tone === "scheduled" ? "var(--red)" : "var(--border)"}`,
    background: tone === "published" ? "rgba(34,197,94,0.16)" : tone === "scheduled" ? "rgba(192,57,43,0.16)" : "rgba(255,255,255,0.04)",
    color: tone === "published" ? "#86efac" : tone === "scheduled" ? "#ffb4aa" : "var(--text2)",
    borderRadius: 4,
    padding: "3px 8px",
    fontFamily: "var(--font-display)",
    fontSize: "0.68rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  });

  const saveBlog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...blogForm, category: normalizeBlogCategory(blogForm.category), scheduledAt: blogForm.published ? null : toSchedulePayload(blogForm.scheduledAt) };
      if (editBlog?.id) await adminApi.updateBlogPost(editBlog.id, payload as any);
      else await adminApi.createBlogPost(payload as any);
      showToast(blogForm.published ? (editBlog?.id ? "Updated and published!" : "Created and published!") : blogForm.scheduledAt ? "Post scheduled!" : (editBlog?.id ? "Draft updated!" : "Draft created!"));
      setShowBlogForm(false); setEditBlog(null); loadData();
    } catch { showToast("Error saving"); }
  };

  const openEditBlog = (p: BlogPost) => {
    setEditBlog(p);
    setBlogForm({ title: p.title, slug: p.slug, excerpt: p.excerpt || "", content: p.content || "", imageUrl: p.imageUrl || "", category: normalizeBlogCategory(p.category), readTime: p.readTime || "", published: p.published, scheduledAt: toDatetimeLocalValue(p.scheduledAt), featured: p.featured });
    setShowBlogForm(true);
  };

  const saveMaintenance = async () => {
    try {
      await adminApi.saveMaintenanceSettings(maintenanceForm);
      showToast(maintenanceForm.enabled ? "Maintenance mode enabled" : "Maintenance mode disabled");
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Error saving maintenance mode");
    }
  };

  const inputStyle = { width: "100%", padding: "8px 12px", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", fontSize: "0.9rem" };
  const labelStyle = { display: "block", fontSize: "0.75rem", color: "var(--text2)", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.05em" };

  if (!authed) return (
    <div style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 360, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 40 }}>
        <h2 style={{ marginBottom: 8, textAlign: "center" }}>Admin</h2>
        <p style={{ color: "var(--text2)", textAlign: "center", marginBottom: 32, fontSize: "0.85rem" }}>BUILD LEVEL Admin Panel</p>
        <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="Enter admin password" autoFocus />
          </div>
          {loginError && <p style={{ color: "var(--red)", fontSize: "0.85rem" }}>{loginError}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>Log In</button>
        </form>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "16px 0" }}>
        <div className="container admin-shell-header">
          <div>
            <h2 style={{ fontSize: "1rem" }}>Admin Panel</h2>
            <p style={{ color: "var(--text3)", fontSize: "0.8rem" }}>Current section: {adminTabLabel(tab)}</p>
          </div>
          <button className="btn btn-outline btn-sm admin-mobile-menu-button" onClick={() => setAdminMenuOpen(current => !current)}>Admin Menu</button>
        </div>
      </div>

      <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg2)" }}>
        <div className={`container admin-nav ${adminMenuOpen ? "admin-nav--open" : ""}`}>
          {adminNavGroups.map(group => (
            <div className="admin-nav__group" key={group.label}>
              <div className="admin-nav__group-label">{group.label}</div>
              <div className="admin-nav__items">
                {group.items.map(item => (
                  <button
                    key={item.tab}
                    onClick={() => { setTab(item.tab); setAdminMenuOpen(false); }}
                    className={`admin-nav__tab ${tab === item.tab ? "admin-nav__tab--active" : ""}`}
                    aria-current={tab === item.tab ? "page" : undefined}
                  >
                    {tab === item.tab ? "● " : ""}{item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="admin-nav__group admin-nav__group--system">
            <div className="admin-nav__group-label">Session</div>
            <button onClick={logout} className="admin-nav__logout">Logout</button>
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: "32px 24px" }}>
        {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><div className="spinner" /></div> : (
          <>
            {/* PRODUCTS TAB */}
            {tab === "products" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ fontSize: "1rem" }}>Apparel Products ({products.length})</h3>
                  <button onClick={() => { setEditProduct(null); setProductForm({ name: "", description: "", price: "", compareAtPrice: "", audience: DEFAULT_AUDIENCE, category: DEFAULT_CATEGORY, sizes: "", imageUrl: "", badge: "", status: "available", inStock: true, published: true, featured: false }); setCustomProductCategory(""); setProductImagePreviews([]); setProductVariantRows([]); setShowProductForm(true); }} className="btn btn-primary btn-sm">+ Add Product</button>
                </div>

                {showProductForm && (
                  <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 24, marginBottom: 24 }}>
                    <h4 style={{ marginBottom: 20, fontSize: "0.9rem" }}>{editProduct?.id ? "Edit Product" : "New Product"}</h4>
                    <form onSubmit={saveProduct} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                      <div><label style={labelStyle}>Name *</label><input style={inputStyle} required value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} /></div>
                      <div>
                        <label style={labelStyle}>Audience</label>
                        <select
                          style={inputStyle}
                          value={productForm.audience}
                          onChange={e => {
                            const audience = e.target.value;
                            setProductForm(f => {
                              const currentCategory = f.category || "";
                              if (!isKnownCategoryForAudience(audience, currentCategory)) {
                                setCustomProductCategory(current => current || getCategoryLabel(currentCategory));
                              }
                              return { ...f, audience };
                            });
                          }}
                        >
                          {enabledAudienceOptions().map(audience => <option key={audience.slug} value={audience.slug}>{audience.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Category</label>
                        <select
                          style={inputStyle}
                          value={isKnownCategoryForAudience(productForm.audience, productForm.category) ? productForm.category : "__custom"}
                          onChange={e => {
                            if (e.target.value === "__custom") {
                              const label = customProductCategory || getCategoryLabel(productForm.category) || "";
                              setCustomProductCategory(label);
                              setProductForm(f => ({ ...f, category: createCustomCategorySlug(f.audience as ApparelAudience, label) || f.category }));
                              return;
                            }
                            setCustomProductCategory("");
                            setProductForm(f => ({ ...f, category: e.target.value }));
                          }}
                        >
                          {dynamicCategoriesForAudience(productForm.audience).map(category => (
                            <option key={category.slug} value={category.slug}>{category.label}</option>
                          ))}
                          <option value="__custom">Custom Category</option>
                        </select>
                        <input
                          style={{ ...inputStyle, marginTop: 8 }}
                          value={customProductCategory}
                          onChange={e => {
                            const value = e.target.value;
                            setCustomProductCategory(value);
                            setProductForm(f => ({ ...f, category: createCustomCategorySlug(f.audience as ApparelAudience, value) }));
                          }}
                          placeholder="Add any future category"
                        />
                        <p style={{ color: "var(--text3)", fontSize: "0.72rem", marginTop: 6 }}>
                          Stored as: {getCategoryLabel(productForm.category)}
                        </p>
                      </div>
                      <div><label style={labelStyle}>Price *</label><input style={inputStyle} type="number" step="0.01" required value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Compare At Price</label><input style={inputStyle} type="number" step="0.01" value={productForm.compareAtPrice} onChange={e => setProductForm(f => ({ ...f, compareAtPrice: e.target.value }))} /></div>
                      <div style={{ gridColumn: editProduct?.printifyProductId || editProduct?.shopifyProductId ? "1/-1" : undefined }}>
                        <label style={labelStyle}>Sizes / Variants</label>
                        {editProduct?.printifyProductId || editProduct?.shopifyProductId ? (
                          <>
                            <p style={{ color: "var(--text3)", fontSize: "0.72rem", marginTop: 6 }}>
                              Edit customer-facing labels and prices. Variant IDs are preserved for checkout and fulfillment.
                            </p>
                            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                              {productVariantRows.map((row, index) => (
                                <div key={`${row.variantId || row.label}-${index}`} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "rgba(255,255,255,0.025)" }}>
                                  <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(120px, 180px) auto", gap: 10, alignItems: "end" }}>
                                    <div>
                                      <label style={{ ...labelStyle, fontSize: "0.66rem" }}>Customer option label</label>
                                      <input
                                        style={inputStyle}
                                        value={row.label}
                                        onChange={e => setProductVariantRows(rows => rows.map((item, i) => i === index ? { ...item, label: e.target.value } : item))}
                                        placeholder="Variant label"
                                      />
                                    </div>
                                    <div>
                                      <label style={{ ...labelStyle, fontSize: "0.66rem" }}>Price</label>
                                      <input
                                        style={inputStyle}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={row.price}
                                        onChange={e => setProductVariantRows(rows => rows.map((item, i) => i === index ? { ...item, price: e.target.value } : item))}
                                        placeholder="Price"
                                      />
                                    </div>
                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setProductVariantRows(rows => rows.filter((_, i) => i !== index))}>Remove</button>
                                  </div>
                                  {row.variantId && <p style={{ color: "var(--text3)", fontSize: "0.68rem", marginTop: 6 }}>Variant ID preserved: {row.variantId}</p>}
                                </div>
                              ))}
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => setProductVariantRows(rows => [...rows, { label: "New Option", price: productForm.price || "", variantId: undefined }])}
                              >
                                + Add Website Option
                              </button>
                            </div>
                          </>
                        ) : (
                          <input
                            style={inputStyle}
                            value={productForm.sizes}
                            onChange={e => setProductForm(f => ({ ...f, sizes: e.target.value }))}
                            placeholder="S, M, L, XL"
                          />
                        )}
                      </div>
                      <div>
                        <label style={labelStyle}>Storefront Status</label>
                        <select
                          style={inputStyle}
                          value={productForm.status}
                          onChange={e => {
                            const status = e.target.value;
                            setProductForm(f => ({
                              ...f,
                              status,
                              badge: statusBadgeFor(status) || (isLaunchBadge(f.badge) ? "" : f.badge),
                              inStock: status === "coming-soon" ? false : f.inStock,
                            }));
                          }}
                        >
                          <option value="available">Available</option>
                          <option value="coming-soon">Coming Soon</option>
                          <option value="new-release">New Release</option>
                          <option value="limited-edition">Limited Edition</option>
                        </select>
                      </div>
                      <div><label style={labelStyle}>Badge</label><input style={inputStyle} value={productForm.badge} onChange={e => setProductForm(f => ({ ...f, badge: e.target.value }))} placeholder="Optional custom badge" /></div>
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={labelStyle}>Image URL / Synced Gallery</label>
                        <input style={inputStyle} value={productForm.imageUrl} onChange={e => setProductForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." />
                        {getProductImages(productForm.imageUrl).length > 1 && (
                          <p style={{ color: "var(--text3)", fontSize: "0.72rem", marginTop: 6 }}>
                            Gallery saved: {getProductImages(productForm.imageUrl).length} images. The first image is the cover.
                          </p>
                        )}
                      </div>
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={labelStyle}>Upload Images From Device</label>
                        <input
                          style={inputStyle}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={e => handleProductImageFiles(e.target.files).catch(() => showToast("Error reading image files"))}
                        />
                        <p style={{ color: "var(--text3)", fontSize: "0.75rem", marginTop: 6 }}>
                          Select one or more images from mobile, laptop, or desktop. Every selected image is saved; the first image is used as the storefront cover.
                        </p>
                        {productImagePreviews.length > 0 && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                            {productImagePreviews.map((src, index) => (
                              <button key={`${src.slice(0, 24)}-${index}`} type="button" onClick={() => setProductForm(f => ({ ...f, imageUrl: serializeProductImages([src, ...productImagePreviews.filter(image => image !== src)]) }))} style={{ padding: 0, border: getProductCoverImage(productForm.imageUrl) === src ? "2px solid var(--red)" : "1px solid var(--border)", borderRadius: 8, background: "transparent" }}>
                                <img src={storageImageUrl(src)} alt={`Product upload ${index + 1}`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, display: "block" }} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={productForm.description} onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))} /></div>
                      <div style={{ display: "flex", gap: 20, gridColumn: "1/-1" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={productForm.published} onChange={e => setProductForm(f => ({ ...f, published: e.target.checked }))} /> Published on storefront</label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: productForm.status === "coming-soon" ? "not-allowed" : "pointer", opacity: productForm.status === "coming-soon" ? 0.6 : 1 }}><input type="checkbox" disabled={productForm.status === "coming-soon"} checked={productForm.inStock} onChange={e => setProductForm(f => ({ ...f, inStock: e.target.checked }))} /> Purchasable / In Stock</label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={productForm.featured} onChange={e => setProductForm(f => ({ ...f, featured: e.target.checked }))} /> Featured</label>
                      </div>
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 12 }}>
                        <button type="submit" className="btn btn-primary btn-sm">Save Product</button>
                        <button type="button" onClick={() => { setShowProductForm(false); setEditProduct(null); setProductImagePreviews([]); setProductVariantRows([]); }} className="btn btn-outline btn-sm">Cancel</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {products.length === 0 ? <p style={{ color: "var(--text2)", padding: 40, textAlign: "center" }}>No products yet. Add your first product above.</p> :
                    products.map(p => {
                      const productImages = getProductImages(p.imageUrl);
                      return (
                      <div key={p.id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                        {getProductCoverImage(p.imageUrl) && <img src={storageImageUrl(getProductCoverImage(p.imageUrl))} alt={p.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
                          <div style={{ color: "var(--text2)", fontSize: "0.8rem" }}>${parseFloat(p.price).toFixed(2)} · {getCategoryAudienceLabel(p.category)} · {getCategoryLabel(p.category)} · {p.published ? "Published" : "Draft"} · {p.inStock ? "In Stock" : "Out of Stock"}</div>
                          {productImages.length > 1 && <div style={{ color: "var(--text3)", fontSize: "0.72rem", marginTop: 3 }}>{productImages.length} synced images</div>}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {p.published && (
                            <a href="/shop" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View</a>
                          )}
                          <button onClick={() => openEditProduct(p)} className="btn btn-outline btn-sm">Edit</button>
                          <button onClick={() => deleteProduct(p.id)} className="btn btn-sm" style={{ background: "none", border: "1px solid var(--red)", color: "var(--red)" }}>Delete</button>
                        </div>
                      </div>
                    );})
                  }
                </div>
              </div>
            )}

            {/* DIGITAL TAB */}
            {tab === "digital" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ fontSize: "1rem" }}>Digital Products ({digital.length})</h3>
                  <button onClick={() => { setEditDigital(null); setDigitalForm({ name: "", description: "", price: "", category: "mindset", productType: "pdf", imageUrl: "", fileKey: "", fileUrl: "", fileName: "", badge: "", stripePaymentLink: "", duration: "", version: "1.0", downloadLimit: "5", accessExpiresDays: "30", published: true, scheduledAt: "" }); setThumbnailPreviews([]); setDigitalFileInfo(null); setDigitalUploadProgress(0); setThumbnailUploadProgress(0); setShowDigitalForm(true); }} className="btn btn-primary btn-sm">+ Add Digital</button>
                </div>

                {showDigitalForm && (
                  <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 24, marginBottom: 24 }}>
                    <h4 style={{ marginBottom: 20, fontSize: "0.9rem" }}>{editDigital?.id ? "Edit Digital Product" : "New Digital Product"}</h4>
                    <form onSubmit={saveDigital} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
                      <div><label style={labelStyle}>Name *</label><input style={inputStyle} required value={digitalForm.name} onChange={e => setDigitalForm(f => ({ ...f, name: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Type</label><select style={inputStyle} value={digitalForm.productType} onChange={e => setDigitalForm(f => ({ ...f, productType: e.target.value as any }))}><option value="pdf">PDF Guide</option><option value="audiobook">Audiobook</option><option value="video">Video Course</option><option value="other">Other</option></select></div>
                      <div><label style={labelStyle}>Price *</label><input style={inputStyle} type="number" step="0.01" required value={digitalForm.price} onChange={e => setDigitalForm(f => ({ ...f, price: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Category</label><input style={inputStyle} value={digitalForm.category} onChange={e => setDigitalForm(f => ({ ...f, category: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Version</label><input style={inputStyle} value={digitalForm.version} onChange={e => setDigitalForm(f => ({ ...f, version: e.target.value }))} placeholder="1.0" /></div>
                      <div><label style={labelStyle}>Download Limit</label><input style={inputStyle} type="number" min="1" value={digitalForm.downloadLimit} onChange={e => setDigitalForm(f => ({ ...f, downloadLimit: e.target.value }))} placeholder="5" /></div>
                      <div><label style={labelStyle}>Access Expires (days)</label><input style={inputStyle} type="number" min="1" value={digitalForm.accessExpiresDays} onChange={e => setDigitalForm(f => ({ ...f, accessExpiresDays: e.target.value }))} placeholder="30" /></div>
                      <div><label style={labelStyle}>Duration</label><input style={inputStyle} value={digitalForm.duration} onChange={e => setDigitalForm(f => ({ ...f, duration: e.target.value }))} placeholder="2h 30m" /></div>
                      <div><label style={labelStyle}>Badge</label><input style={inputStyle} value={digitalForm.badge} onChange={e => setDigitalForm(f => ({ ...f, badge: e.target.value }))} /></div>
                      <div
                        style={{ gridColumn: "1/-1", border: "1px dashed var(--border)", borderRadius: 10, padding: 18, background: "rgba(255,255,255,0.025)" }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) uploadDigitalFile(file); }}
                      >
                        <label style={labelStyle}>Digital File Upload</label>
                        {digitalUploadConfig?.storage.configured === false && (
                          <div style={{ border: "1px solid rgba(192,57,43,0.45)", background: "rgba(192,57,43,0.08)", color: "#ffb4aa", borderRadius: 8, padding: 10, fontSize: "0.8rem", marginBottom: 12, lineHeight: 1.5 }}>
                            Upload storage is not configured on Render. Add R2/S3 upload env vars to upload videos/PDFs directly, or paste a hosted file URL below.
                          </div>
                        )}
                        <p style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: 12 }}>Drop any digital file here, or tap to select from mobile/desktop. Common types: {DIGITAL_FILE_TYPE_EXAMPLES}.</p>
                        <p style={{ color: "var(--text3)", fontSize: "0.75rem", marginBottom: 12 }}>
                          Large videos over {formatBytes(DIRECT_SERVER_UPLOAD_RECOMMENDED_MAX_BYTES)} should be uploaded to R2/S3 first, then pasted in Digital File URL. Browser uploads pass through Cloudflare/Render request limits.
                        </p>
                        <input
                          style={inputStyle}
                          type="file"
                          disabled={digitalUploadConfig?.storage.configured === false}
                          onChange={e => { const file = e.target.files?.[0]; if (file) uploadDigitalFile(file); }}
                        />
                        {digitalUploadProgress > 0 && (
                          <div style={{ marginTop: 12, height: 8, borderRadius: 99, background: "var(--bg3)", overflow: "hidden" }}>
                            <div style={{ width: `${digitalUploadProgress}%`, height: "100%", background: "var(--red)", transition: "width 0.2s ease" }} />
                          </div>
                        )}
                        {digitalUploadProgress > 0 && digitalUploadProgress < 100 && (
                          <p style={{ color: "var(--text2)", fontSize: "0.78rem", marginTop: 8 }}>
                            Uploading... keep this page open and wait before saving.
                          </p>
                        )}
                        {digitalFileInfo && (
                          <p style={{ color: "var(--text2)", fontSize: "0.8rem", marginTop: 10 }}>
                            File: {digitalFileInfo.name} · {formatBytes(digitalFileInfo.size)} · {digitalFileInfo.mimeType}
                          </p>
                        )}
                        {(digitalForm.fileKey || digitalForm.fileUrl) && (
                          <div style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.035)", borderRadius: 8, padding: 10, marginTop: 10 }}>
                            <p style={{ color: "var(--text2)", fontSize: "0.78rem", marginBottom: 4 }}>
                              Saved file reference: {(digitalForm.fileName || digitalForm.fileKey || digitalForm.fileUrl).slice(0, 140)}
                            </p>
                            <p style={{ color: "var(--text3)", fontSize: "0.72rem" }}>
                              The browser file picker will still say "No file chosen" after reload; this saved reference confirms the product has a file attached.
                            </p>
                          </div>
                        )}
                      </div>
                      <div style={{ gridColumn: "1/-1" }}>
                        <label style={labelStyle}>Digital File URL</label>
                        <input
                          style={inputStyle}
                          value={digitalForm.fileUrl}
                          onChange={e => setDigitalForm(f => ({ ...f, fileUrl: e.target.value, fileKey: e.target.value ? "" : f.fileKey, fileName: e.target.value ? (f.fileName || "External digital file") : f.fileName }))}
                          placeholder="https://.../your-video-or-pdf"
                        />
                        <p style={{ color: "var(--text3)", fontSize: "0.74rem", marginTop: 6 }}>
                          Use this when upload storage is not configured. The URL must stay accessible after purchase.
                        </p>
                      </div>
                      <div
                        style={{ gridColumn: "1/-1", border: "1px dashed var(--border)", borderRadius: 10, padding: 18, background: "rgba(255,255,255,0.025)" }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); if (e.dataTransfer.files) uploadThumbnails(e.dataTransfer.files); }}
                      >
                        <label style={labelStyle}>Product Thumbnails</label>
                        <p style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: 12 }}>Upload one or more thumbnails. Click a preview to choose the featured storefront thumbnail.</p>
                        <input style={inputStyle} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => e.target.files && uploadThumbnails(e.target.files)} />
                        {thumbnailUploadProgress > 0 && (
                          <div style={{ marginTop: 12, height: 8, borderRadius: 99, background: "var(--bg3)", overflow: "hidden" }}>
                            <div style={{ width: `${thumbnailUploadProgress}%`, height: "100%", background: "var(--red)", transition: "width 0.2s ease" }} />
                          </div>
                        )}
                        {thumbnailPreviews.length > 0 && (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                            {thumbnailPreviews.map((src, index) => (
                              <button key={`${src.slice(0, 24)}-${index}`} type="button" onClick={() => setDigitalForm(f => ({ ...f, imageUrl: src }))} style={{ padding: 0, border: digitalForm.imageUrl === src ? "2px solid var(--red)" : "1px solid var(--border)", borderRadius: 8, background: "transparent" }}>
                                <img src={storageImageUrl(src)} alt={`Thumbnail ${index + 1}`} style={{ width: 86, height: 64, objectFit: "cover", borderRadius: 6 }} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Stripe Payment Link (optional)</label><input style={inputStyle} value={digitalForm.stripePaymentLink} onChange={e => setDigitalForm(f => ({ ...f, stripePaymentLink: e.target.value }))} placeholder="https://buy.stripe.com/..." /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={digitalForm.description} onChange={e => setDigitalForm(f => ({ ...f, description: e.target.value }))} /></div>
                      <div style={{ gridColumn: "1/-1", border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "rgba(255,255,255,0.025)" }}>
                        <label style={labelStyle}>Schedule Digital Release</label>
                        <input
                          style={inputStyle}
                          type="datetime-local"
                          value={digitalForm.scheduledAt}
                          disabled={digitalForm.published}
                          onFocus={() => setDigitalForm(f => ({ ...f, scheduledAt: f.scheduledAt || defaultDigitalScheduleAtMidnight(), published: false }))}
                          onChange={e => setDigitalForm(f => ({ ...f, scheduledAt: e.target.value, published: false }))}
                        />
                        <p style={{ color: "var(--text3)", fontSize: "0.75rem", marginTop: 6 }}>
                          Leave Published unchecked, then choose when this digital product becomes available. Until then, customers only see the thumbnail and countdown.
                        </p>
                      </div>
                      <div><label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={digitalForm.published} onChange={e => setDigitalForm(f => ({ ...f, published: e.target.checked, scheduledAt: e.target.checked ? "" : (f.scheduledAt || defaultDigitalScheduleAtMidnight()) }))} /> Published / Available now</label></div>
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 12 }}>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={digitalUploadProgress > 0 && digitalUploadProgress < 100}>
                          {digitalUploadProgress > 0 && digitalUploadProgress < 100 ? "Uploading..." : "Save"}
                        </button>
                        <button type="button" onClick={() => { setShowDigitalForm(false); setEditDigital(null); setThumbnailPreviews([]); setDigitalFileInfo(null); setDigitalUploadProgress(0); setThumbnailUploadProgress(0); }} className="btn btn-outline btn-sm">Cancel</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {digital.length === 0 ? <p style={{ color: "var(--text2)", padding: 40, textAlign: "center" }}>No digital products yet.</p> :
                    digital.map(p => {
                      const status = getDigitalStatus(p);
                      return (
                      <div key={p.id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                        {p.imageUrl && <img src={storageImageUrl(p.imageUrl)} alt={p.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
                          <div style={{ color: "var(--text2)", fontSize: "0.8rem", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span>${parseFloat(p.price).toFixed(2)} · {p.productType}</span>
                            <span style={blogStatusStyle(status.tone)}>{status.label}</span>
                            {status.detail && <span style={{ color: "var(--text3)" }}>{status.detail}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {p.published && (
                            <a href="/digital" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View</a>
                          )}
                          <button onClick={() => openEditDigital(p)} className="btn btn-outline btn-sm">Edit</button>
                          <button onClick={async () => { if (confirm("Delete?")) { await adminApi.deleteDigitalProduct(p.id); loadData(); showToast("Deleted"); } }} className="btn btn-sm" style={{ background: "none", border: "1px solid var(--red)", color: "var(--red)" }}>Delete</button>
                        </div>
                      </div>
                    );})
                  }
                </div>
              </div>
            )}

            {/* BLOG TAB */}
            {tab === "blog" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ fontSize: "1rem" }}>Blog Posts ({blog.length})</h3>
                  <button onClick={() => { setEditBlog(null); setBlogForm({ title: "", slug: "", excerpt: "", content: "", imageUrl: "", category: DEFAULT_BLOG_CATEGORY, readTime: "", published: true, scheduledAt: "", featured: false }); setShowBlogForm(true); }} className="btn btn-primary btn-sm">+ Add Post</button>
                </div>

                {showBlogForm && (
                  <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 24, marginBottom: 24 }}>
                    <h4 style={{ marginBottom: 20, fontSize: "0.9rem" }}>{editBlog?.id ? "Edit Post" : "New Post"}</h4>
                    <form onSubmit={saveBlog} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div><label style={labelStyle}>Title *</label><input style={inputStyle} required value={blogForm.title} onChange={e => setBlogForm(f => ({ ...f, title: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Slug *</label><input style={inputStyle} required value={blogForm.slug} onChange={e => setBlogForm(f => ({ ...f, slug: e.target.value }))} placeholder="my-post-title" /></div>
                      <div>
                        <label style={labelStyle}>Category</label>
                        <select
                          style={inputStyle}
                          value={BLOG_CATEGORIES.some(category => category.slug === blogForm.category) ? blogForm.category : ""}
                          onChange={e => e.target.value && setBlogForm(f => ({ ...f, category: e.target.value }))}
                        >
                          <option value="">Custom / Future Category</option>
                          {BLOG_CATEGORIES.map(category => (
                            <option key={category.slug} value={category.slug}>{category.label}</option>
                          ))}
                        </select>
                        <input
                          list="blog-category-options"
                          style={{ ...inputStyle, marginTop: 8 }}
                          value={blogForm.category}
                          onChange={e => setBlogForm(f => ({ ...f, category: normalizeBlogCategory(e.target.value) }))}
                          placeholder="Search or enter a category"
                        />
                        <datalist id="blog-category-options">
                          {BLOG_CATEGORIES.map(category => <option key={category.slug} value={category.slug}>{category.label}</option>)}
                        </datalist>
                        <p style={{ color: "var(--text3)", fontSize: "0.72rem", marginTop: 6 }}>Stored as: {getBlogCategoryLabel(blogForm.category)}</p>
                      </div>
                      <div><label style={labelStyle}>Read Time</label><input style={inputStyle} value={blogForm.readTime} onChange={e => setBlogForm(f => ({ ...f, readTime: e.target.value }))} placeholder="5 min read" /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Image URL</label><input style={inputStyle} value={blogForm.imageUrl} onChange={e => setBlogForm(f => ({ ...f, imageUrl: e.target.value }))} /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Excerpt</label><textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={blogForm.excerpt} onChange={e => setBlogForm(f => ({ ...f, excerpt: e.target.value }))} /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Content</label><textarea style={{ ...inputStyle, resize: "vertical" }} rows={8} value={blogForm.content} onChange={e => setBlogForm(f => ({ ...f, content: e.target.value }))} /></div>
                      <div style={{ gridColumn: "1/-1", border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "rgba(255,255,255,0.025)" }}>
                        <label style={labelStyle}>Schedule Publish</label>
                        <input
                          style={inputStyle}
                          type="datetime-local"
                          value={blogForm.scheduledAt}
                          disabled={blogForm.published}
                          onFocus={() => setBlogForm(f => ({ ...f, scheduledAt: f.scheduledAt || defaultScheduleAtMidnight(), published: false }))}
                          onChange={e => setBlogForm(f => ({ ...f, scheduledAt: e.target.value, published: false }))}
                        />
                        <p style={{ color: "var(--text3)", fontSize: "0.75rem", marginTop: 6 }}>
                          Leave Published unchecked, then choose a date and time. The post will become visible automatically when this time arrives. Check Published to publish right away.
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 20, gridColumn: "1/-1" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={blogForm.published} onChange={e => setBlogForm(f => ({ ...f, published: e.target.checked, scheduledAt: e.target.checked ? "" : (f.scheduledAt || defaultScheduleAtMidnight()) }))} /> Published now</label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={blogForm.featured} onChange={e => setBlogForm(f => ({ ...f, featured: e.target.checked }))} /> Featured</label>
                      </div>
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 12 }}>
                        <button type="submit" className="btn btn-primary btn-sm">Save</button>
                        <button type="button" onClick={() => { setShowBlogForm(false); setEditBlog(null); }} className="btn btn-outline btn-sm">Cancel</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {blog.length === 0 ? <p style={{ color: "var(--text2)", padding: 40, textAlign: "center" }}>No posts yet.</p> :
                    blog.map(p => (
                      <div key={p.id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                        {(() => {
                          const status = getBlogStatus(p);
                          return (
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, marginBottom: 2 }}>{p.title}</div>
                          <div style={{ color: "var(--text2)", fontSize: "0.8rem", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span>{p.slug} · {getBlogCategoryLabel(p.category)}</span>
                            <span style={blogStatusStyle(status.tone)}>{status.label}</span>
                            {status.detail && <span style={{ color: "var(--text3)" }}>{status.detail}</span>}
                          </div>
                        </div>
                          );
                        })()}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => openEditBlog(p)} className="btn btn-outline btn-sm">Edit</button>
                          <button onClick={async () => { if (confirm("Delete?")) { await adminApi.deleteBlogPost(p.id); loadData(); showToast("Deleted"); } }} className="btn btn-sm" style={{ background: "none", border: "1px solid var(--red)", color: "var(--red)" }}>Delete</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {tab === "integrations" && (
              <AdminIntegrationsPanel showToast={showToast} />
            )}

            {tab === "shop-org" && (
              <AdminShopOrganizationPanel products={products} showToast={showToast} onChanged={loadData} />
            )}

            {tab === "fulfillment" && (
              <AdminFulfillmentPanel showToast={showToast} />
            )}

            {tab === "support" && (
              <AdminSupportPanel showToast={showToast} />
            )}

            {tab === "abandoned" && (
              <AdminAbandonedCartsPanel showToast={showToast} />
            )}

            {tab === "subscribers" && (
              <AdminSubscribersPanel showToast={showToast} />
            )}

            {tab === "campaigns" && (
              <AdminEmailCampaignsPanel showToast={showToast} />
            )}

            {tab === "moderation" && (
              <AdminModerationPanel showToast={showToast} />
            )}

            {tab === "maintenance" && (
              <div style={{ maxWidth: 840 }}>
                <div style={{ background: "linear-gradient(145deg, rgba(26,26,26,0.96), rgba(10,10,10,0.96))", border: "1px solid var(--border)", borderRadius: 12, padding: 24, boxShadow: "0 18px 45px rgba(0,0,0,0.28)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
                    <div>
                      <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>Storefront Gate</div>
                      <h3 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Maintenance Mode</h3>
                      <p style={{ color: "var(--text2)", fontSize: "0.9rem", maxWidth: 620 }}>
                        Temporarily replace public storefront pages with a premium coming-soon page. Admin remains fully accessible.
                      </p>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text2)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={maintenanceForm.enabled}
                        onChange={e => setMaintenanceForm(f => ({ ...f, enabled: e.target.checked }))}
                      />
                      {maintenanceForm.enabled ? "Enabled" : "Disabled"}
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Title</label>
                      <input className="input" value={maintenanceForm.title} onChange={e => setMaintenanceForm(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Contact Email</label>
                      <input className="input" type="email" value={maintenanceForm.contactEmail} onChange={e => setMaintenanceForm(f => ({ ...f, contactEmail: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={labelStyle}>Message</label>
                      <textarea className="input" rows={4} value={maintenanceForm.message} onChange={e => setMaintenanceForm(f => ({ ...f, message: e.target.value }))} style={{ resize: "vertical" }} />
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={labelStyle}>Return Text</label>
                      <input className="input" value={maintenanceForm.returnText} onChange={e => setMaintenanceForm(f => ({ ...f, returnText: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
                    <button type="button" onClick={saveMaintenance} className="btn btn-primary btn-sm">
                      Save Maintenance Mode
                    </button>
                    <a href="/" target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                      Open Public Site
                    </a>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {toast && <div className={`toast ${toast.includes("Error") ? "error" : "success"}`}>{toast}</div>}
    </div>
  );
}
