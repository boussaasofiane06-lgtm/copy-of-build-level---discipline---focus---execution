/* ==========================================================================
   BUILD LEVEL — Admin REST API Client
   All admin API calls go through this module.
   Uses /api/admin/* REST endpoints on the backend.
   Auth: sends x-admin-token header (raw password) or Authorization: Bearer (JWT)
   ========================================================================== */

const ADMIN_TOKEN_KEY = "bl_admin_token";

function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token) return {};
  // JWT tokens start with eyJ; raw passwords use x-admin-token header
  if (token.startsWith("eyJ")) {
    return { Authorization: `Bearer ${token}` };
  }
  return { "x-admin-token": token };
}

async function adminFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function adminLogin(password: string): Promise<{ success: boolean; token?: string }> {
  return adminFetch("POST", "/api/admin/login", { password });
}

export async function adminLogout(): Promise<void> {
  await adminFetch("POST", "/api/admin/logout");
}

export async function adminMe(): Promise<{ admin: boolean }> {
  return adminFetch("GET", "/api/admin/me");
}

// ─── Products ─────────────────────────────────────────────────────────────────

export interface Product {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  compareAtPrice?: string | null;
  category: string;
  sizes: string[];
  imageUrl?: string | null;
  badge?: string | null;
  inStock: boolean;
  published: boolean;
  hidden: boolean;
  delisted: boolean;
  featured: boolean;
  sortOrder: number;
  shopifyVariantId?: string | null;
  shopifyProductId?: string | null;
  printifyProductId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function listProducts(): Promise<Product[]> {
  return adminFetch("GET", "/api/admin/products");
}

export async function createProduct(data: Omit<Product, "id" | "createdAt" | "updatedAt">): Promise<{ success: boolean; id: number }> {
  return adminFetch("POST", "/api/admin/products", data);
}

export async function updateProduct(id: number, data: Partial<Omit<Product, "id">>): Promise<{ success: boolean }> {
  return adminFetch("PUT", `/api/admin/products/${id}`, data);
}

export async function deleteProduct(id: number): Promise<{ success: boolean }> {
  return adminFetch("DELETE", `/api/admin/products/${id}`);
}

// ─── Blog ─────────────────────────────────────────────────────────────────────

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  content?: string | null;
  excerpt?: string | null;
  imageUrl?: string | null;
  published: boolean;
  scheduledAt?: string | null;
  featured: boolean;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export async function listBlogPosts(): Promise<BlogPost[]> {
  return adminFetch("GET", "/api/admin/blog");
}

export async function createBlogPost(data: Omit<BlogPost, "id" | "createdAt" | "updatedAt">): Promise<{ success: boolean; id: number }> {
  return adminFetch("POST", "/api/admin/blog", data);
}

export async function updateBlogPost(id: number, data: Partial<Omit<BlogPost, "id">>): Promise<{ success: boolean }> {
  return adminFetch("PUT", `/api/admin/blog/${id}`, data);
}

export async function deleteBlogPost(id: number): Promise<{ success: boolean }> {
  return adminFetch("DELETE", `/api/admin/blog/${id}`);
}

// ─── Digital Products ─────────────────────────────────────────────────────────

export interface DigitalProduct {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  fileUrl?: string | null;
  imageUrl?: string | null;
  published: boolean;
  scheduledAt?: string | null;
  downloadCount?: number;
  createdAt?: string;
}

export async function listDigitalProducts(): Promise<DigitalProduct[]> {
  return adminFetch("GET", "/api/admin/digital");
}

export async function createDigitalProduct(data: Omit<DigitalProduct, "id" | "createdAt" | "downloadCount">): Promise<{ success: boolean; id: number }> {
  return adminFetch("POST", "/api/admin/digital", data);
}

export async function updateDigitalProduct(id: number, data: Partial<Omit<DigitalProduct, "id">>): Promise<{ success: boolean }> {
  return adminFetch("PUT", `/api/admin/digital/${id}`, data);
}

export async function deleteDigitalProduct(id: number): Promise<{ success: boolean }> {
  return adminFetch("DELETE", `/api/admin/digital/${id}`);
}

// ─── AI Videos ──────────────────────────────────────────────────────────────────

export interface AIVideo {
  id: number;
  title: string;
  description?: string | null;
  videoUrl: string;
  thumbnailUrl?: string | null;
  category: string;
  duration?: string | null;
  badge?: string | null;
  published: boolean;
  sortOrder: number;
  createdAt?: string;
}

export async function listVideos(): Promise<AIVideo[]> {
  return adminFetch("GET", "/api/admin/videos");
}

export async function createVideo(data: Omit<AIVideo, "id" | "createdAt">): Promise<AIVideo> {
  return adminFetch("POST", "/api/admin/videos", data);
}

export async function updateVideo(id: number, data: Partial<Omit<AIVideo, "id">>): Promise<AIVideo> {
  return adminFetch("PUT", `/api/admin/videos/${id}`, data);
}

export async function deleteVideo(id: number): Promise<{ success: boolean }> {
  return adminFetch("DELETE", `/api/admin/videos/${id}`);
}

// ─── Affiliate Products ───────────────────────────────────────────────────────

export interface AffiliateProduct {
  id: number;
  name: string;
  description?: string | null;
  price?: string | null;
  affiliateUrl: string;
  imageUrl?: string | null;
  category: string;
  brand?: string | null;
  badge?: string | null;
  commission?: string | null;
  published: boolean;
  sortOrder: number;
  createdAt?: string;
}

export async function listAffiliateProducts(): Promise<AffiliateProduct[]> {
  return adminFetch("GET", "/api/admin/affiliate");
}

export async function createAffiliateProduct(data: Omit<AffiliateProduct, "id" | "createdAt">): Promise<AffiliateProduct> {
  return adminFetch("POST", "/api/admin/affiliate", data);
}

export async function updateAffiliateProduct(id: number, data: Partial<Omit<AffiliateProduct, "id">>): Promise<AffiliateProduct> {
  return adminFetch("PUT", `/api/admin/affiliate/${id}`, data);
}

export async function deleteAffiliateProduct(id: number): Promise<{ success: boolean }> {
  return adminFetch("DELETE", `/api/admin/affiliate/${id}`);
}

// ─── Membership Tiers ─────────────────────────────────────────────────────────

export interface MembershipTier {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  interval: string;
  features?: string[] | null;
  badge?: string | null;
  published: boolean;
  sortOrder: number;
  stripePaymentLink?: string | null;
  createdAt?: string;
}

export async function listMembershipTiers(): Promise<MembershipTier[]> {
  return adminFetch("GET", "/api/admin/membership");
}

export async function createMembershipTier(data: Omit<MembershipTier, "id" | "createdAt">): Promise<MembershipTier> {
  return adminFetch("POST", "/api/admin/membership", data);
}

export async function updateMembershipTier(id: number, data: Partial<Omit<MembershipTier, "id">>): Promise<MembershipTier> {
  return adminFetch("PUT", `/api/admin/membership/${id}`, data);
}

export async function deleteMembershipTier(id: number): Promise<{ success: boolean }> {
  return adminFetch("DELETE", `/api/admin/membership/${id}`);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Record<string, string>> {
  return adminFetch("GET", "/api/admin/settings");
}

export async function saveSettings(data: Record<string, string>): Promise<{ success: boolean }> {
  return adminFetch("POST", "/api/admin/settings", data);
}
