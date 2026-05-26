import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

const expectArray = <T>(data: unknown, endpoint: string): T[] => {
  if (Array.isArray(data)) return data as T[];

  console.warn(`[API] Expected an array from ${endpoint}, received ${typeof data}.`);
  return [];
};

const isRecord = (data: unknown): data is Record<string, unknown> =>
  typeof data === "object" && data !== null && !Array.isArray(data);

const expectSuccess = <T extends Record<string, unknown>>(
  data: unknown,
  endpoint: string,
  predicate: (value: Record<string, unknown>) => boolean
): T => {
  if (isRecord(data) && predicate(data)) return data as T;

  throw new Error(`Invalid response from ${endpoint}`);
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  compareAtPrice?: string;
  category: string;
  sizes: string[];
  imageUrl?: string;
  badge?: string;
  inStock: boolean;
  published: boolean;
  hidden: boolean;
  delisted: boolean;
  featured: boolean;
  sortOrder: number;
  shopifyVariantId?: string | null;
  shopifyProductId?: string | null;
  printifyProductId?: string | null;
  createdAt: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  imageUrl?: string;
  category: string;
  readTime?: string;
  published: boolean;
  featured: boolean;
  createdAt: string;
}

export interface DigitalProduct {
  id: number;
  name: string;
  description?: string;
  price: string;
  category: string;
  productType: "pdf" | "audiobook" | "video" | "other";
  imageUrl?: string;
  fileKey?: string;
  fileName?: string;
  fileUrl?: string;
  audioUrl?: string;
  duration?: string;
  badge?: string;
  stripePaymentLink?: string;
  published: boolean;
  createdAt: string;
}

export interface IntegrationOverview {
  generatedAt: string;
  integrations: {
    shopify: { connected: boolean; disabled?: boolean; storeUrl: string; token: string; capabilities: string[] };
    printify: { connected: boolean; disabled?: boolean; shopId: string; token: string; capabilities: string[] };
    stripe: { connected: boolean; disabled?: boolean; webhookConfigured: boolean; key: string; capabilities: string[] };
    tidio: { enabled: boolean; disabled?: boolean; configured: boolean; publicKey: string; capabilities: string[] };
    social: SocialPlatformSetting[];
  };
  automation: {
    socialSchedulerEnabled: boolean;
    campaignName: string;
    socialSharingEnabled: boolean;
  };
  system: {
    cloudflarePagesCompatible: boolean;
    renderApiCompatible: boolean;
    railwayDatabaseCompatible: boolean;
    publicStorefrontExposure: boolean;
  };
}

export interface SocialPlatformSetting {
  platform: "instagram" | "facebook" | "tiktok" | "youtube" | "x" | "pinterest";
  enabled: boolean;
  handle: string;
  url: string;
  analyticsEnabled: boolean;
  oauth?: {
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    accessTokenConfigured: boolean;
  };
}

export interface TidioConfig {
  enabled: boolean;
  publicKey: string;
  chatControls: string;
  chatbotSettings: string;
}

export interface StripeDashboard {
  connected: boolean;
  webhookConfigured?: boolean;
  balance?: unknown;
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    created: number;
    customer?: unknown;
  }>;
  sessions: Array<{
    id: string;
    amountTotal: number | null;
    currency: string | null;
    paymentStatus: string;
    customerEmail?: string | null;
    created: number;
  }>;
  message?: string;
}

export interface ExternalSyncResponse {
  success?: boolean;
  summary?: Record<string, number>;
  products?: unknown;
  orders?: unknown;
  customers?: unknown;
  webhooks?: unknown;
}

export interface PublicSocialLink {
  platform: "instagram" | "facebook" | "tiktok" | "youtube" | "x" | "pinterest";
  handle: string;
  url: string;
  enabled: boolean;
}

export interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
  returnText: string;
  contactEmail: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const publicApi = {
  getProducts: () => api.get<unknown>("/products").then(r => expectArray<Product>(r.data, "/products")),
  getProduct: (id: number) => api.get<Product>(`/products/${id}`).then(r => r.data),
  getBlogPosts: () => api.get<unknown>("/blog").then(r => expectArray<BlogPost>(r.data, "/blog")),
  getBlogPost: (slug: string) => api.get<BlogPost>(`/blog/${slug}`).then(r => r.data),
  getDigitalProducts: () => api.get<unknown>("/digital").then(r => expectArray<DigitalProduct>(r.data, "/digital")),
  createCheckout: (items: any[], currency?: string, customerEmail?: string) =>
    api.post<{ url: string }>("/stripe/checkout", { items, currency, customerEmail }).then(r => r.data),
  createDigitalCheckout: (productId: number, customerEmail?: string) =>
    api.post<{ url: string }>("/stripe/digital-checkout", { productId, customerEmail }).then(r => r.data),
  getSocialLinks: () => api.get<{ email: string; links: PublicSocialLink[] }>("/social-links").then(r => r.data),
  getTidioConfig: () => api.get<{ enabled: boolean; publicKey: string; chatControls: string }>("/tidio/config").then(r => r.data),
  getMaintenanceConfig: () => api.get<MaintenanceConfig>("/maintenance").then(r => r.data),
  sendContact: (data: { name: string; email: string; message: string }) =>
    api.post<{ success: true }>("/contact", data).then(r => r.data),
};

// ─── Admin API ────────────────────────────────────────────────────────────────
export const adminApi = {
  login: (password: string) =>
    api.post<unknown>("/admin/login", { password }).then(r =>
      expectSuccess<{ success: true; token?: string }>(r.data, "/admin/login", data => data.success === true)
    ),
  logout: () =>
    api.post<unknown>("/admin/logout").then(r =>
      expectSuccess<{ success: true }>(r.data, "/admin/logout", data => data.success === true)
    ),
  me: () =>
    api.get<unknown>("/admin/me").then(r =>
      expectSuccess<{ admin: true }>(r.data, "/admin/me", data => data.admin === true)
    ),

  // Products
  getProducts: () => api.get<unknown>("/admin/products").then(r => expectArray<Product>(r.data, "/admin/products")),
  createProduct: (data: Partial<Product> & { price: number }) =>
    api.post("/admin/products", data).then(r => r.data),
  updateProduct: (id: number, data: Partial<Product>) =>
    api.put(`/admin/products/${id}`, data).then(r => r.data),
  deleteProduct: (id: number) => api.delete(`/admin/products/${id}`).then(r => r.data),

  // Blog
  getBlogPosts: () => api.get<unknown>("/admin/blog").then(r => expectArray<BlogPost>(r.data, "/admin/blog")),
  createBlogPost: (data: Partial<BlogPost>) => api.post("/admin/blog", data).then(r => r.data),
  updateBlogPost: (id: number, data: Partial<BlogPost>) =>
    api.put(`/admin/blog/${id}`, data).then(r => r.data),
  deleteBlogPost: (id: number) => api.delete(`/admin/blog/${id}`).then(r => r.data),

  // Digital
  getDigitalProducts: () => api.get<unknown>("/admin/digital").then(r => expectArray<DigitalProduct>(r.data, "/admin/digital")),
  createDigitalProduct: (data: Partial<DigitalProduct> & { price: number }) =>
    api.post("/admin/digital", data).then(r => r.data),
  updateDigitalProduct: (id: number, data: Partial<DigitalProduct>) =>
    api.put(`/admin/digital/${id}`, data).then(r => r.data),
  deleteDigitalProduct: (id: number) => api.delete(`/admin/digital/${id}`).then(r => r.data),
  getDigitalUploadConfig: () => api.get<{
    maxDigitalFileSizeBytes: number;
    allowedFileTypes: string[];
    allowedThumbnailTypes: string[];
    storage: { configured: boolean; provider: string };
  }>("/admin/digital/upload-config").then(r => r.data),
  uploadDigitalAsset: (
    file: File,
    kind: "digital" | "thumbnail",
    onProgress?: (progress: number) => void
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);
    return api.post<{
      success: true;
      kind: "digital" | "thumbnail";
      key: string;
      url: string;
      fileName: string;
      size: number;
      mimeType: string;
    }>("/admin/digital/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (event) => {
        if (!event.total || !onProgress) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    }).then(r => r.data);
  },

  // Settings
  getSettings: () => api.get<Record<string, string>>("/admin/settings").then(r => r.data),
  setSetting: (key: string, value: string) =>
    api.post("/admin/settings", { key, value }).then(r => r.data),
  getMaintenanceSettings: () => api.get<MaintenanceConfig>("/admin/maintenance").then(r => r.data),
  saveMaintenanceSettings: (data: MaintenanceConfig) =>
    api.post<{ success: true }>("/admin/maintenance", data).then(r => r.data),

  // Integrations
  getIntegrationOverview: () => api.get<IntegrationOverview>("/admin/integrations/overview").then(r => r.data),
  testIntegration: (provider: string) => api.post<{ ok: boolean; message?: string; status?: number; error?: string }>(`/admin/integrations/test/${provider}`).then(r => r.data),
  disconnectIntegration: (provider: string) => api.post<{ success: true; provider: string; disabled: boolean }>(`/admin/integrations/disconnect/${provider}`).then(r => r.data),
  enableIntegration: (provider: string) => api.post<{ success: true; provider: string; disabled: boolean }>(`/admin/integrations/enable/${provider}`).then(r => r.data),
  saveShopifyCredentials: (data: { storeUrl: string; apiKey: string }) => api.post<{ success: true }>("/admin/shopify/credentials", data).then(r => r.data),
  getShopifyProducts: () => api.get<unknown>("/admin/shopify/products").then(r => r.data),
  getShopifyOrders: () => api.get<unknown>("/admin/shopify/orders").then(r => r.data),
  getShopifyCustomers: () => api.get<unknown>("/admin/shopify/customers").then(r => r.data),
  getShopifyInventory: () => api.get<unknown>("/admin/shopify/inventory").then(r => r.data),
  getShopifyWebhooks: () => api.get<unknown>("/admin/shopify/webhooks").then(r => r.data),
  syncShopify: () => api.get<ExternalSyncResponse>("/admin/shopify/sync").then(r => r.data),
  setupShopifyWebhooks: () => api.post<{ success: boolean; webhookUrl: string; results: Array<{ topic: string; status: string; error?: string }> }>("/admin/shopify/webhooks/setup").then(r => r.data),
  savePrintifyCredentials: (data: { apiKey: string; shopId: string }) => api.post<{ success: true }>("/admin/printify/credentials", data).then(r => r.data),
  getPrintifyProducts: () => api.get<unknown>("/admin/printify/products").then(r => r.data),
  getPrintifyOrders: () => api.get<unknown>("/admin/printify/orders").then(r => r.data),
  getPrintifyInventory: () => api.get<unknown>("/admin/printify/inventory").then(r => r.data),
  syncPrintify: () => api.get<ExternalSyncResponse>("/admin/printify/sync").then(r => r.data),
  setupPrintifyWebhooks: () => api.post<{ success: boolean; webhookUrl: string; results: Array<{ topic: string; status: string; error?: string }> }>("/admin/printify/webhooks/setup").then(r => r.data),
  publishPrintifyProduct: (printifyProductId: string) => api.post<{ success: boolean; data?: unknown }>("/admin/printify/publish", { printifyProductId }).then(r => r.data),
  getStripeDashboard: () => api.get<StripeDashboard>("/admin/integrations/stripe/dashboard").then(r => r.data),
  getTidioConfig: () => api.get<TidioConfig>("/admin/integrations/tidio/config").then(r => r.data),
  saveTidioConfig: (data: TidioConfig) => api.post<{ success: true }>("/admin/integrations/tidio/config", data).then(r => r.data),
  getSocialSettings: () => api.get<{
    schedulerEnabled: boolean;
    campaignName: string;
    socialSharingEnabled: boolean;
    platforms: SocialPlatformSetting[];
  }>("/admin/integrations/social/settings").then(r => r.data),
  saveSocialSettings: (data: {
    schedulerEnabled: boolean;
    campaignName: string;
    socialSharingEnabled: boolean;
    platforms: SocialPlatformSetting[];
  }) => api.post<{ success: true }>("/admin/integrations/social/settings", data).then(r => r.data),
};
