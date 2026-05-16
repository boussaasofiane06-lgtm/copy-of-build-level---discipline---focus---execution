import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

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
  fileUrl?: string;
  audioUrl?: string;
  duration?: string;
  badge?: string;
  stripePaymentLink?: string;
  published: boolean;
  createdAt: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const publicApi = {
  getProducts: () => api.get<Product[]>("/products").then(r => r.data),
  getProduct: (id: number) => api.get<Product>(`/products/${id}`).then(r => r.data),
  getBlogPosts: () => api.get<BlogPost[]>("/blog").then(r => r.data),
  getBlogPost: (slug: string) => api.get<BlogPost>(`/blog/${slug}`).then(r => r.data),
  getDigitalProducts: () => api.get<DigitalProduct[]>("/digital").then(r => r.data),
  createCheckout: (items: any[], currency?: string, customerEmail?: string) =>
    api.post<{ url: string }>("/stripe/checkout", { items, currency, customerEmail }).then(r => r.data),
  createDigitalCheckout: (productId: number, customerEmail?: string) =>
    api.post<{ url: string }>("/stripe/digital-checkout", { productId, customerEmail }).then(r => r.data),
};

// ─── Admin API ────────────────────────────────────────────────────────────────
export const adminApi = {
  login: (password: string) => api.post("/admin/login", { password }).then(r => r.data),
  logout: () => api.post("/admin/logout").then(r => r.data),
  me: () => api.get("/admin/me").then(r => r.data),

  // Products
  getProducts: () => api.get<Product[]>("/admin/products").then(r => r.data),
  createProduct: (data: Partial<Product> & { price: number }) =>
    api.post("/admin/products", data).then(r => r.data),
  updateProduct: (id: number, data: Partial<Product>) =>
    api.put(`/admin/products/${id}`, data).then(r => r.data),
  deleteProduct: (id: number) => api.delete(`/admin/products/${id}`).then(r => r.data),

  // Blog
  getBlogPosts: () => api.get<BlogPost[]>("/admin/blog").then(r => r.data),
  createBlogPost: (data: Partial<BlogPost>) => api.post("/admin/blog", data).then(r => r.data),
  updateBlogPost: (id: number, data: Partial<BlogPost>) =>
    api.put(`/admin/blog/${id}`, data).then(r => r.data),
  deleteBlogPost: (id: number) => api.delete(`/admin/blog/${id}`).then(r => r.data),

  // Digital
  getDigitalProducts: () => api.get<DigitalProduct[]>("/admin/digital").then(r => r.data),
  createDigitalProduct: (data: Partial<DigitalProduct> & { price: number }) =>
    api.post("/admin/digital", data).then(r => r.data),
  updateDigitalProduct: (id: number, data: Partial<DigitalProduct>) =>
    api.put(`/admin/digital/${id}`, data).then(r => r.data),
  deleteDigitalProduct: (id: number) => api.delete(`/admin/digital/${id}`).then(r => r.data),

  // Settings
  getSettings: () => api.get<Record<string, string>>("/admin/settings").then(r => r.data),
  setSetting: (key: string, value: string) =>
    api.post("/admin/settings", { key, value }).then(r => r.data),
};
