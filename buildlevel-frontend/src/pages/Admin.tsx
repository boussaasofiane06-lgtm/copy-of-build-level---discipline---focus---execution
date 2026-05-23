import { useState, useEffect } from "react";
import { adminApi, Product, BlogPost, DigitalProduct } from "../lib/api";
import AdminIntegrationsPanel from "../components/AdminIntegrationsPanel";
import {
  APPAREL_AUDIENCES,
  DEFAULT_AUDIENCE,
  DEFAULT_CATEGORY,
  getAudienceForCategory,
  getCategoriesForAudience,
  getCategoryAudienceLabel,
  getCategoryLabel,
  type ApparelAudience,
} from "../lib/apparelCategories";
import { BLOG_CATEGORIES, DEFAULT_BLOG_CATEGORY, getBlogCategoryLabel, normalizeBlogCategory } from "../lib/blogCategories";

type Tab = "products" | "digital" | "blog" | "integrations";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<Tab>("products");

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [digital, setDigital] = useState<DigitalProduct[]>([]);
  const [blog, setBlog] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  // Product form
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [productForm, setProductForm] = useState({ name: "", description: "", price: "", compareAtPrice: "", audience: DEFAULT_AUDIENCE as ApparelAudience, category: DEFAULT_CATEGORY, sizes: "", imageUrl: "", badge: "", inStock: true, published: true, featured: false });
  const [productImagePreviews, setProductImagePreviews] = useState<string[]>([]);

  // Digital form
  const [showDigitalForm, setShowDigitalForm] = useState(false);
  const [editDigital, setEditDigital] = useState<Partial<DigitalProduct> | null>(null);
  const [digitalForm, setDigitalForm] = useState({ name: "", description: "", price: "", category: "mindset", productType: "pdf" as "pdf"|"audiobook"|"video"|"other", imageUrl: "", fileKey: "", fileUrl: "", fileName: "", badge: "", stripePaymentLink: "", duration: "", version: "1.0", downloadLimit: "5", published: true });
  const [digitalUploadProgress, setDigitalUploadProgress] = useState(0);
  const [thumbnailUploadProgress, setThumbnailUploadProgress] = useState(0);
  const [thumbnailPreviews, setThumbnailPreviews] = useState<string[]>([]);
  const [digitalFileInfo, setDigitalFileInfo] = useState<{ name: string; size: number; mimeType: string } | null>(null);

  // Blog form
  const [showBlogForm, setShowBlogForm] = useState(false);
  const [editBlog, setEditBlog] = useState<Partial<BlogPost> | null>(null);
  const [blogForm, setBlogForm] = useState({ title: "", slug: "", excerpt: "", content: "", imageUrl: "", category: DEFAULT_BLOG_CATEGORY, readTime: "", published: true, featured: false });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

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
      const [p, d, b] = await Promise.all([adminApi.getProducts(), adminApi.getDigitalProducts(), adminApi.getBlogPosts()]);
      setProducts(p); setDigital(d); setBlog(b);
    } catch { }
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
    const data = { ...productPayload, price: parseFloat(productForm.price), compareAtPrice: productForm.compareAtPrice ? parseFloat(productForm.compareAtPrice) : undefined, sizes: productForm.sizes.split(",").map(s => s.trim()).filter(Boolean) };
    try {
      if (editProduct?.id) await adminApi.updateProduct(editProduct.id, data as any);
      else await adminApi.createProduct(data as any);
      showToast(editProduct?.id ? "Product updated!" : "Product created!");
      setShowProductForm(false); setEditProduct(null);
      setProductImagePreviews([]);
      loadData();
    } catch { showToast("Error saving product"); }
  };

  const handleProductImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(file => file.type.startsWith("image/"));
    const dataUrls = await Promise.all(imageFiles.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
    setProductImagePreviews(dataUrls);
    if (dataUrls[0]) setProductForm(f => ({ ...f, imageUrl: dataUrls[0] }));
  };

  const deleteProduct = async (id: number) => {
    if (!confirm("Delete this product?")) return;
    await adminApi.deleteProduct(id); loadData(); showToast("Deleted");
  };

  const openEditProduct = (p: Product) => {
    const audience = getAudienceForCategory(p.category);
    setEditProduct(p);
    setProductForm({ name: p.name, description: p.description || "", price: p.price, compareAtPrice: p.compareAtPrice || "", audience, category: p.category || getCategoriesForAudience(audience)[0]?.slug || DEFAULT_CATEGORY, sizes: p.sizes.join(", "), imageUrl: p.imageUrl || "", badge: p.badge || "", inStock: p.inStock, published: p.published, featured: p.featured });
    setProductImagePreviews(p.imageUrl ? [p.imageUrl] : []);
    setShowProductForm(true);
  };

  // Digital CRUD
  const saveDigital = async (e: React.FormEvent) => {
    e.preventDefault();
    const { version: _version, downloadLimit: _downloadLimit, ...digitalPayload } = digitalForm;
    const data = { ...digitalPayload, price: parseFloat(digitalForm.price) };
    try {
      if (editDigital?.id) await adminApi.updateDigitalProduct(editDigital.id, data as any);
      else await adminApi.createDigitalProduct(data as any);
      showToast(editDigital?.id ? "Updated!" : "Created!");
      setShowDigitalForm(false); setEditDigital(null); setDigitalUploadProgress(0); setThumbnailUploadProgress(0); setThumbnailPreviews([]); setDigitalFileInfo(null); loadData();
    } catch { showToast("Error saving"); }
  };

  const openEditDigital = (p: DigitalProduct) => {
    setEditDigital(p);
    setDigitalForm({ name: p.name, description: p.description || "", price: p.price, category: p.category, productType: p.productType, imageUrl: p.imageUrl || "", fileKey: p.fileKey || "", fileUrl: p.fileUrl || "", fileName: p.fileName || "", badge: p.badge || "", stripePaymentLink: p.stripePaymentLink || "", duration: p.duration || "", version: "1.0", downloadLimit: "5", published: p.published });
    setThumbnailPreviews(p.imageUrl ? [p.imageUrl] : []);
    setDigitalFileInfo(p.fileName ? { name: p.fileName, size: 0, mimeType: "Stored file" } : null);
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
    setDigitalUploadProgress(1);
    try {
      const uploaded = await adminApi.uploadDigitalAsset(file, "digital", setDigitalUploadProgress);
      setDigitalForm(f => ({ ...f, fileKey: uploaded.key, fileUrl: uploaded.url, fileName: uploaded.fileName }));
      setDigitalFileInfo({ name: uploaded.fileName, size: uploaded.size, mimeType: uploaded.mimeType });
      setDigitalUploadProgress(100);
      showToast("Digital file uploaded");
    } catch {
      setDigitalUploadProgress(0);
      showToast("Upload storage needs configuration");
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
        const preview = uploaded.url || URL.createObjectURL(imageFiles[index]);
        previews.push(preview);
        if (index === 0) setDigitalForm(f => ({ ...f, imageUrl: preview }));
      }
      setThumbnailPreviews(previews);
      setThumbnailUploadProgress(100);
      showToast("Thumbnails uploaded");
    } catch {
      setThumbnailUploadProgress(0);
      showToast("Thumbnail upload needs storage configuration");
    }
  };

  // Blog CRUD
  const saveBlog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...blogForm, category: normalizeBlogCategory(blogForm.category) };
      if (editBlog?.id) await adminApi.updateBlogPost(editBlog.id, payload as any);
      else await adminApi.createBlogPost(payload as any);
      showToast(editBlog?.id ? "Updated!" : "Created!");
      setShowBlogForm(false); setEditBlog(null); loadData();
    } catch { showToast("Error saving"); }
  };

  const openEditBlog = (p: BlogPost) => {
    setEditBlog(p);
    setBlogForm({ title: p.title, slug: p.slug, excerpt: p.excerpt || "", content: p.content || "", imageUrl: p.imageUrl || "", category: normalizeBlogCategory(p.category), readTime: p.readTime || "", published: p.published, featured: p.featured });
    setShowBlogForm(true);
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
      {/* Header */}
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "16px 0" }}>
        <div className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1rem" }}>Admin Panel</h2>
          <button onClick={() => { adminApi.logout(); setAuthed(false); }} className="btn btn-ghost btn-sm">Logout</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg2)" }}>
        <div className="container" style={{ display: "flex", gap: 0 }}>
          {(["products", "digital", "blog", "integrations"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "14px 24px", background: "none", border: "none", cursor: "pointer",
              fontFamily: "var(--font-display)", fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase",
              color: tab === t ? "var(--text)" : "var(--text2)",
              borderBottom: tab === t ? "2px solid var(--red)" : "2px solid transparent",
            }}>
              {t === "products" ? "Apparel" : t === "digital" ? "Digital" : t === "blog" ? "Blog" : "Integrations"}
            </button>
          ))}
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
                  <button onClick={() => { setEditProduct(null); setProductForm({ name: "", description: "", price: "", compareAtPrice: "", audience: DEFAULT_AUDIENCE, category: DEFAULT_CATEGORY, sizes: "", imageUrl: "", badge: "", inStock: true, published: true, featured: false }); setProductImagePreviews([]); setShowProductForm(true); }} className="btn btn-primary btn-sm">+ Add Product</button>
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
                            const audience = e.target.value as ApparelAudience;
                            setProductForm(f => ({
                              ...f,
                              audience,
                              category: getCategoriesForAudience(audience)[0]?.slug || DEFAULT_CATEGORY,
                            }));
                          }}
                        >
                          {APPAREL_AUDIENCES.map(audience => <option key={audience.value} value={audience.value}>{audience.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Category</label>
                        <select style={inputStyle} value={productForm.category} onChange={e => setProductForm(f => ({ ...f, category: e.target.value }))}>
                          {getCategoriesForAudience(productForm.audience).map(category => (
                            <option key={category.slug} value={category.slug}>{category.label}</option>
                          ))}
                        </select>
                      </div>
                      <div><label style={labelStyle}>Price *</label><input style={inputStyle} type="number" step="0.01" required value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Compare At Price</label><input style={inputStyle} type="number" step="0.01" value={productForm.compareAtPrice} onChange={e => setProductForm(f => ({ ...f, compareAtPrice: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Sizes (comma-separated)</label><input style={inputStyle} value={productForm.sizes} onChange={e => setProductForm(f => ({ ...f, sizes: e.target.value }))} placeholder="S, M, L, XL" /></div>
                      <div><label style={labelStyle}>Badge</label><input style={inputStyle} value={productForm.badge} onChange={e => setProductForm(f => ({ ...f, badge: e.target.value }))} placeholder="NEW, SALE, etc." /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Image URL</label><input style={inputStyle} value={productForm.imageUrl} onChange={e => setProductForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." /></div>
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
                          Select one or more images from mobile, laptop, or desktop. The first image is used as the storefront cover.
                        </p>
                        {productImagePreviews.length > 0 && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                            {productImagePreviews.map((src, index) => (
                              <img key={`${src.slice(0, 24)}-${index}`} src={src} alt={`Product upload ${index + 1}`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={productForm.description} onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))} /></div>
                      <div style={{ display: "flex", gap: 20, gridColumn: "1/-1" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={productForm.published} onChange={e => setProductForm(f => ({ ...f, published: e.target.checked }))} /> Published</label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={productForm.inStock} onChange={e => setProductForm(f => ({ ...f, inStock: e.target.checked }))} /> In Stock</label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={productForm.featured} onChange={e => setProductForm(f => ({ ...f, featured: e.target.checked }))} /> Featured</label>
                      </div>
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 12 }}>
                        <button type="submit" className="btn btn-primary btn-sm">Save</button>
                        <button type="button" onClick={() => { setShowProductForm(false); setEditProduct(null); setProductImagePreviews([]); }} className="btn btn-outline btn-sm">Cancel</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {products.length === 0 ? <p style={{ color: "var(--text2)", padding: 40, textAlign: "center" }}>No products yet. Add your first product above.</p> :
                    products.map(p => (
                      <div key={p.id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                        {p.imageUrl && <img src={p.imageUrl} alt={p.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
                          <div style={{ color: "var(--text2)", fontSize: "0.8rem" }}>${parseFloat(p.price).toFixed(2)} · {getCategoryAudienceLabel(p.category)} · {getCategoryLabel(p.category)} · {p.published ? "Published" : "Draft"} · {p.inStock ? "In Stock" : "Out of Stock"}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => openEditProduct(p)} className="btn btn-outline btn-sm">Edit</button>
                          <button onClick={() => deleteProduct(p.id)} className="btn btn-sm" style={{ background: "none", border: "1px solid var(--red)", color: "var(--red)" }}>Delete</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* DIGITAL TAB */}
            {tab === "digital" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ fontSize: "1rem" }}>Digital Products ({digital.length})</h3>
                  <button onClick={() => { setEditDigital(null); setDigitalForm({ name: "", description: "", price: "", category: "mindset", productType: "pdf", imageUrl: "", fileKey: "", fileUrl: "", fileName: "", badge: "", stripePaymentLink: "", duration: "", version: "1.0", downloadLimit: "5", published: true }); setThumbnailPreviews([]); setDigitalFileInfo(null); setDigitalUploadProgress(0); setThumbnailUploadProgress(0); setShowDigitalForm(true); }} className="btn btn-primary btn-sm">+ Add Digital</button>
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
                      <div><label style={labelStyle}>Duration</label><input style={inputStyle} value={digitalForm.duration} onChange={e => setDigitalForm(f => ({ ...f, duration: e.target.value }))} placeholder="2h 30m" /></div>
                      <div><label style={labelStyle}>Badge</label><input style={inputStyle} value={digitalForm.badge} onChange={e => setDigitalForm(f => ({ ...f, badge: e.target.value }))} /></div>
                      <div
                        style={{ gridColumn: "1/-1", border: "1px dashed var(--border)", borderRadius: 10, padding: 18, background: "rgba(255,255,255,0.025)" }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) uploadDigitalFile(file); }}
                      >
                        <label style={labelStyle}>Digital File Upload</label>
                        <p style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: 12 }}>Drop a PDF, ZIP, video, image, DOCX, PPTX, or XLSX file here, or tap to select from mobile/desktop.</p>
                        <input
                          style={inputStyle}
                          type="file"
                          accept=".pdf,.zip,.mp4,.mov,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx"
                          onChange={e => { const file = e.target.files?.[0]; if (file) uploadDigitalFile(file); }}
                        />
                        {digitalUploadProgress > 0 && (
                          <div style={{ marginTop: 12, height: 8, borderRadius: 99, background: "var(--bg3)", overflow: "hidden" }}>
                            <div style={{ width: `${digitalUploadProgress}%`, height: "100%", background: "var(--red)", transition: "width 0.2s ease" }} />
                          </div>
                        )}
                        {digitalFileInfo && (
                          <p style={{ color: "var(--text2)", fontSize: "0.8rem", marginTop: 10 }}>
                            File: {digitalFileInfo.name} · {formatBytes(digitalFileInfo.size)} · {digitalFileInfo.mimeType}
                          </p>
                        )}
                        {digitalForm.fileUrl && <p style={{ color: "var(--text3)", fontSize: "0.75rem", marginTop: 6 }}>Secure file attached. Saving this product will use the uploaded file for delivery.</p>}
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
                                <img src={src} alt={`Thumbnail ${index + 1}`} style={{ width: 86, height: 64, objectFit: "cover", borderRadius: 6 }} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Stripe Payment Link (optional)</label><input style={inputStyle} value={digitalForm.stripePaymentLink} onChange={e => setDigitalForm(f => ({ ...f, stripePaymentLink: e.target.value }))} placeholder="https://buy.stripe.com/..." /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={digitalForm.description} onChange={e => setDigitalForm(f => ({ ...f, description: e.target.value }))} /></div>
                      <div><label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={digitalForm.published} onChange={e => setDigitalForm(f => ({ ...f, published: e.target.checked }))} /> Published</label></div>
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 12 }}>
                        <button type="submit" className="btn btn-primary btn-sm">Save</button>
                        <button type="button" onClick={() => { setShowDigitalForm(false); setEditDigital(null); setThumbnailPreviews([]); setDigitalFileInfo(null); setDigitalUploadProgress(0); setThumbnailUploadProgress(0); }} className="btn btn-outline btn-sm">Cancel</button>
                      </div>
                    </form>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {digital.length === 0 ? <p style={{ color: "var(--text2)", padding: 40, textAlign: "center" }}>No digital products yet.</p> :
                    digital.map(p => (
                      <div key={p.id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
                          <div style={{ color: "var(--text2)", fontSize: "0.8rem" }}>${parseFloat(p.price).toFixed(2)} · {p.productType} · {p.published ? "Published" : "Draft"}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => openEditDigital(p)} className="btn btn-outline btn-sm">Edit</button>
                          <button onClick={async () => { if (confirm("Delete?")) { await adminApi.deleteDigitalProduct(p.id); loadData(); showToast("Deleted"); } }} className="btn btn-sm" style={{ background: "none", border: "1px solid var(--red)", color: "var(--red)" }}>Delete</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* BLOG TAB */}
            {tab === "blog" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h3 style={{ fontSize: "1rem" }}>Blog Posts ({blog.length})</h3>
                  <button onClick={() => { setEditBlog(null); setBlogForm({ title: "", slug: "", excerpt: "", content: "", imageUrl: "", category: DEFAULT_BLOG_CATEGORY, readTime: "", published: true, featured: false }); setShowBlogForm(true); }} className="btn btn-primary btn-sm">+ Add Post</button>
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
                      <div style={{ display: "flex", gap: 20, gridColumn: "1/-1" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={blogForm.published} onChange={e => setBlogForm(f => ({ ...f, published: e.target.checked }))} /> Published</label>
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
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, marginBottom: 2 }}>{p.title}</div>
                          <div style={{ color: "var(--text2)", fontSize: "0.8rem" }}>{p.slug} · {getBlogCategoryLabel(p.category)} · {p.published ? "Published" : "Draft"}</div>
                        </div>
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
          </>
        )}
      </div>

      {toast && <div className={`toast ${toast.includes("Error") ? "error" : "success"}`}>{toast}</div>}
    </div>
  );
}
