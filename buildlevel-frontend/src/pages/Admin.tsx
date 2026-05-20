import { useState, useEffect } from "react";
import { adminApi, Product, BlogPost, DigitalProduct } from "../lib/api";

type Tab = "products" | "digital" | "blog";

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
  const [productForm, setProductForm] = useState({ name: "", description: "", price: "", compareAtPrice: "", category: "apparel", sizes: "", imageUrl: "", badge: "", inStock: true, published: true, featured: false });

  // Digital form
  const [showDigitalForm, setShowDigitalForm] = useState(false);
  const [editDigital, setEditDigital] = useState<Partial<DigitalProduct> | null>(null);
  const [digitalForm, setDigitalForm] = useState({ name: "", description: "", price: "", category: "mindset", productType: "pdf" as "pdf"|"audiobook"|"video"|"other", imageUrl: "", badge: "", stripePaymentLink: "", duration: "", published: true });

  // Blog form
  const [showBlogForm, setShowBlogForm] = useState(false);
  const [editBlog, setEditBlog] = useState<Partial<BlogPost> | null>(null);
  const [blogForm, setBlogForm] = useState({ title: "", slug: "", excerpt: "", content: "", imageUrl: "", category: "mindset", readTime: "", published: true, featured: false });

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
    const data = { ...productForm, price: parseFloat(productForm.price), compareAtPrice: productForm.compareAtPrice ? parseFloat(productForm.compareAtPrice) : undefined, sizes: productForm.sizes.split(",").map(s => s.trim()).filter(Boolean) };
    try {
      if (editProduct?.id) await adminApi.updateProduct(editProduct.id, data as any);
      else await adminApi.createProduct(data as any);
      showToast(editProduct?.id ? "Product updated!" : "Product created!");
      setShowProductForm(false); setEditProduct(null);
      loadData();
    } catch { showToast("Error saving product"); }
  };

  const deleteProduct = async (id: number) => {
    if (!confirm("Delete this product?")) return;
    await adminApi.deleteProduct(id); loadData(); showToast("Deleted");
  };

  const openEditProduct = (p: Product) => {
    setEditProduct(p);
    setProductForm({ name: p.name, description: p.description || "", price: p.price, compareAtPrice: p.compareAtPrice || "", category: p.category, sizes: p.sizes.join(", "), imageUrl: p.imageUrl || "", badge: p.badge || "", inStock: p.inStock, published: p.published, featured: p.featured });
    setShowProductForm(true);
  };

  // Digital CRUD
  const saveDigital = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...digitalForm, price: parseFloat(digitalForm.price) };
    try {
      if (editDigital?.id) await adminApi.updateDigitalProduct(editDigital.id, data as any);
      else await adminApi.createDigitalProduct(data as any);
      showToast(editDigital?.id ? "Updated!" : "Created!");
      setShowDigitalForm(false); setEditDigital(null); loadData();
    } catch { showToast("Error saving"); }
  };

  const openEditDigital = (p: DigitalProduct) => {
    setEditDigital(p);
    setDigitalForm({ name: p.name, description: p.description || "", price: p.price, category: p.category, productType: p.productType, imageUrl: p.imageUrl || "", badge: p.badge || "", stripePaymentLink: p.stripePaymentLink || "", duration: p.duration || "", published: p.published });
    setShowDigitalForm(true);
  };

  // Blog CRUD
  const saveBlog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editBlog?.id) await adminApi.updateBlogPost(editBlog.id, blogForm as any);
      else await adminApi.createBlogPost(blogForm as any);
      showToast(editBlog?.id ? "Updated!" : "Created!");
      setShowBlogForm(false); setEditBlog(null); loadData();
    } catch { showToast("Error saving"); }
  };

  const openEditBlog = (p: BlogPost) => {
    setEditBlog(p);
    setBlogForm({ title: p.title, slug: p.slug, excerpt: p.excerpt || "", content: p.content || "", imageUrl: p.imageUrl || "", category: p.category, readTime: p.readTime || "", published: p.published, featured: p.featured });
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
          {(["products", "digital", "blog"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "14px 24px", background: "none", border: "none", cursor: "pointer",
              fontFamily: "var(--font-display)", fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase",
              color: tab === t ? "var(--text)" : "var(--text2)",
              borderBottom: tab === t ? "2px solid var(--red)" : "2px solid transparent",
            }}>
              {t === "products" ? "Apparel" : t === "digital" ? "Digital" : "Blog"}
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
                  <button onClick={() => { setEditProduct(null); setProductForm({ name: "", description: "", price: "", compareAtPrice: "", category: "apparel", sizes: "", imageUrl: "", badge: "", inStock: true, published: true, featured: false }); setShowProductForm(true); }} className="btn btn-primary btn-sm">+ Add Product</button>
                </div>

                {showProductForm && (
                  <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 24, marginBottom: 24 }}>
                    <h4 style={{ marginBottom: 20, fontSize: "0.9rem" }}>{editProduct?.id ? "Edit Product" : "New Product"}</h4>
                    <form onSubmit={saveProduct} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div><label style={labelStyle}>Name *</label><input style={inputStyle} required value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Category</label><select style={inputStyle} value={productForm.category} onChange={e => setProductForm(f => ({ ...f, category: e.target.value }))}><option value="apparel">Apparel</option><option value="accessories">Accessories</option><option value="headwear">Headwear</option></select></div>
                      <div><label style={labelStyle}>Price *</label><input style={inputStyle} type="number" step="0.01" required value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Compare At Price</label><input style={inputStyle} type="number" step="0.01" value={productForm.compareAtPrice} onChange={e => setProductForm(f => ({ ...f, compareAtPrice: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Sizes (comma-separated)</label><input style={inputStyle} value={productForm.sizes} onChange={e => setProductForm(f => ({ ...f, sizes: e.target.value }))} placeholder="S, M, L, XL" /></div>
                      <div><label style={labelStyle}>Badge</label><input style={inputStyle} value={productForm.badge} onChange={e => setProductForm(f => ({ ...f, badge: e.target.value }))} placeholder="NEW, SALE, etc." /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Image URL</label><input style={inputStyle} value={productForm.imageUrl} onChange={e => setProductForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={productForm.description} onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))} /></div>
                      <div style={{ display: "flex", gap: 20, gridColumn: "1/-1" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={productForm.published} onChange={e => setProductForm(f => ({ ...f, published: e.target.checked }))} /> Published</label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={productForm.inStock} onChange={e => setProductForm(f => ({ ...f, inStock: e.target.checked }))} /> In Stock</label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={productForm.featured} onChange={e => setProductForm(f => ({ ...f, featured: e.target.checked }))} /> Featured</label>
                      </div>
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 12 }}>
                        <button type="submit" className="btn btn-primary btn-sm">Save</button>
                        <button type="button" onClick={() => { setShowProductForm(false); setEditProduct(null); }} className="btn btn-outline btn-sm">Cancel</button>
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
                          <div style={{ color: "var(--text2)", fontSize: "0.8rem" }}>${parseFloat(p.price).toFixed(2)} · {p.category} · {p.published ? "Published" : "Draft"} · {p.inStock ? "In Stock" : "Out of Stock"}</div>
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
                  <button onClick={() => { setEditDigital(null); setDigitalForm({ name: "", description: "", price: "", category: "mindset", productType: "pdf", imageUrl: "", badge: "", stripePaymentLink: "", duration: "", published: true }); setShowDigitalForm(true); }} className="btn btn-primary btn-sm">+ Add Digital</button>
                </div>

                {showDigitalForm && (
                  <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 24, marginBottom: 24 }}>
                    <h4 style={{ marginBottom: 20, fontSize: "0.9rem" }}>{editDigital?.id ? "Edit Digital Product" : "New Digital Product"}</h4>
                    <form onSubmit={saveDigital} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div><label style={labelStyle}>Name *</label><input style={inputStyle} required value={digitalForm.name} onChange={e => setDigitalForm(f => ({ ...f, name: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Type</label><select style={inputStyle} value={digitalForm.productType} onChange={e => setDigitalForm(f => ({ ...f, productType: e.target.value as any }))}><option value="pdf">PDF Guide</option><option value="audiobook">Audiobook</option><option value="video">Video Course</option><option value="other">Other</option></select></div>
                      <div><label style={labelStyle}>Price *</label><input style={inputStyle} type="number" step="0.01" required value={digitalForm.price} onChange={e => setDigitalForm(f => ({ ...f, price: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Category</label><input style={inputStyle} value={digitalForm.category} onChange={e => setDigitalForm(f => ({ ...f, category: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Duration</label><input style={inputStyle} value={digitalForm.duration} onChange={e => setDigitalForm(f => ({ ...f, duration: e.target.value }))} placeholder="2h 30m" /></div>
                      <div><label style={labelStyle}>Badge</label><input style={inputStyle} value={digitalForm.badge} onChange={e => setDigitalForm(f => ({ ...f, badge: e.target.value }))} /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Image URL</label><input style={inputStyle} value={digitalForm.imageUrl} onChange={e => setDigitalForm(f => ({ ...f, imageUrl: e.target.value }))} /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Stripe Payment Link (optional)</label><input style={inputStyle} value={digitalForm.stripePaymentLink} onChange={e => setDigitalForm(f => ({ ...f, stripePaymentLink: e.target.value }))} placeholder="https://buy.stripe.com/..." /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={digitalForm.description} onChange={e => setDigitalForm(f => ({ ...f, description: e.target.value }))} /></div>
                      <div><label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}><input type="checkbox" checked={digitalForm.published} onChange={e => setDigitalForm(f => ({ ...f, published: e.target.checked }))} /> Published</label></div>
                      <div style={{ gridColumn: "1/-1", display: "flex", gap: 12 }}>
                        <button type="submit" className="btn btn-primary btn-sm">Save</button>
                        <button type="button" onClick={() => { setShowDigitalForm(false); setEditDigital(null); }} className="btn btn-outline btn-sm">Cancel</button>
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
                  <button onClick={() => { setEditBlog(null); setBlogForm({ title: "", slug: "", excerpt: "", content: "", imageUrl: "", category: "mindset", readTime: "", published: true, featured: false }); setShowBlogForm(true); }} className="btn btn-primary btn-sm">+ Add Post</button>
                </div>

                {showBlogForm && (
                  <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 24, marginBottom: 24 }}>
                    <h4 style={{ marginBottom: 20, fontSize: "0.9rem" }}>{editBlog?.id ? "Edit Post" : "New Post"}</h4>
                    <form onSubmit={saveBlog} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div><label style={labelStyle}>Title *</label><input style={inputStyle} required value={blogForm.title} onChange={e => setBlogForm(f => ({ ...f, title: e.target.value }))} /></div>
                      <div><label style={labelStyle}>Slug *</label><input style={inputStyle} required value={blogForm.slug} onChange={e => setBlogForm(f => ({ ...f, slug: e.target.value }))} placeholder="my-post-title" /></div>
                      <div><label style={labelStyle}>Category</label><input style={inputStyle} value={blogForm.category} onChange={e => setBlogForm(f => ({ ...f, category: e.target.value }))} /></div>
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
                          <div style={{ color: "var(--text2)", fontSize: "0.8rem" }}>{p.slug} · {p.category} · {p.published ? "Published" : "Draft"}</div>
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
          </>
        )}
      </div>

      {toast && <div className={`toast ${toast.includes("Error") ? "error" : "success"}`}>{toast}</div>}
    </div>
  );
}
