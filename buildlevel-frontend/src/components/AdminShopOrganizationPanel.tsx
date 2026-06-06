import { useEffect, useMemo, useState } from "react";
import { Product, ShopAudience, ShopCategory, ShopTaxonomy, adminApi } from "../lib/api";

const panelStyle: React.CSSProperties = { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 };

function slugify(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

type Tab = "audiences" | "products" | "events";

export default function AdminShopOrganizationPanel({ products, showToast, onChanged }: { products: Product[]; showToast: (message: string, type?: "success" | "error") => void; onChanged?: () => void }) {
  const [tab, setTab] = useState<Tab>("audiences");
  const [taxonomy, setTaxonomy] = useState<ShopTaxonomy>({ audiences: [], categories: [], productAssignments: [] });
  const [selectedAudienceSlug, setSelectedAudienceSlug] = useState("for-you");
  const [audienceModalOpen, setAudienceModalOpen] = useState(false);
  const [editingAudienceId, setEditingAudienceId] = useState<number | null>(null);
  const [audienceForm, setAudienceForm] = useState({ name: "", slug: "", enabled: true, hidden: false, displayOrder: 0 });
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryForm, setCategoryForm] = useState({ audienceId: 0, name: "", slug: "", categoryType: "category", displayOrder: 0, enabled: true, hidden: false, description: "" });
  const [filters, setFilters] = useState({ audienceId: 0, categoryId: 0, source: "", published: "", availability: "", search: "" });
  const [classification, setClassification] = useState({ productId: 0, audienceId: 0, categoryId: 0 });
  const [eventName, setEventName] = useState("");

  const load = async () => {
    try {
      const data = await adminApi.getShopTaxonomy();
      const audiences = Array.from(new Map(data.audiences.map(item => [item.slug, item])).values());
      const categories = Array.from(new Map(data.categories.map(item => [`${item.audienceId}:${item.parentId || 0}:${item.slug}`, item])).values());
      const productAssignments = Array.from(new Map(data.productAssignments.map(item => [`${item.productId}:${item.audienceSlug}:${item.assignmentType || ""}:${item.categorySlug || ""}`, item])).values());
      setTaxonomy({ audiences, categories, productAssignments });
      const firstAudience = audiences.find(a => a.slug === selectedAudienceSlug) || audiences[0];
      setCategoryForm(f => ({ ...f, audienceId: f.audienceId || firstAudience?.id || 0 }));
      setClassification(f => ({ ...f, productId: f.productId || products[0]?.id || 0, audienceId: f.audienceId || firstAudience?.id || 0 }));
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Failed to load Shop Management", "error");
    }
  };

  useEffect(() => { load(); }, []);

  const selectedAudience = taxonomy.audiences.find(a => a.slug === selectedAudienceSlug) || taxonomy.audiences[0];
  const selectedCategories = taxonomy.categories.filter(c => Number(c.audienceId) === Number(selectedAudience?.id));
  const categoryTypes = [
    ["featured_box", "Featured Boxes"],
    ["category", "Categories"],
    ["trend", "Shop by Trends"],
    ["recommended", "Recommended"],
    ["event", "Temporary Events"],
  ];

  const assignmentFor = (productId: number) => taxonomy.productAssignments.filter(row => Number(row.productId) === productId);
  const productAudience = (product: Product) => assignmentFor(product.id)[0]?.audienceName || "Unassigned";
  const productCategory = (product: Product) => assignmentFor(product.id).find(row => row.assignmentType === "primary")?.categoryName || product.category;
  const productSource = (product: Product) => product.printifyProductId ? "Printify" : product.shopifyProductId ? "Shopify" : "Manual Apparel";

  const filteredProducts = useMemo(() => products.filter(product => {
    const rows = assignmentFor(product.id);
    if (filters.audienceId && !rows.some(row => taxonomy.audiences.find(a => a.id === filters.audienceId)?.slug === row.audienceSlug)) return false;
    if (filters.categoryId && !rows.some(row => taxonomy.categories.find(c => c.id === filters.categoryId)?.slug === row.categorySlug)) return false;
    if (filters.source && productSource(product) !== filters.source) return false;
    if (filters.published === "published" && !product.published) return false;
    if (filters.published === "draft" && product.published) return false;
    if (filters.availability === "available" && !product.inStock) return false;
    if (filters.availability === "unavailable" && product.inStock) return false;
    if (filters.search && !product.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  }), [products, filters, taxonomy]);

  const openCategoryModal = (audienceId = selectedAudience?.id || 0, type = "category") => {
    setEditingCategoryId(null);
    setCategoryForm({ audienceId, name: "", slug: "", categoryType: type, displayOrder: 0, enabled: true, hidden: false, description: "" });
    setCategoryModalOpen(true);
  };

  const openAudienceModal = (audience?: ShopAudience) => {
    setEditingAudienceId(audience?.id || null);
    setAudienceForm({
      name: audience?.name || "",
      slug: audience?.slug || "",
      enabled: audience ? Boolean(audience.enabled) : true,
      hidden: audience ? Boolean(audience.hidden) : false,
      displayOrder: Number(audience?.displayOrder || 0),
    });
    setAudienceModalOpen(true);
  };

  const saveAudience = async () => {
    const payload = { ...audienceForm, slug: audienceForm.slug || slugify(audienceForm.name) };
    if (editingAudienceId) await adminApi.updateShopAudience(editingAudienceId, payload as any);
    else await adminApi.createShopAudience(payload as any);
    showToast(editingAudienceId ? "Audience updated" : "Audience added");
    setAudienceModalOpen(false);
    setEditingAudienceId(null);
    load();
    onChanged?.();
  };

  const deleteAudience = async (audience: ShopAudience) => {
    if (!window.confirm(`Delete audience "${audience.name}"? This is blocked if categories or products are assigned.`)) return;
    try {
      await adminApi.deleteShopAudience(audience.id);
      showToast("Audience deleted");
      load();
      onChanged?.();
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Could not delete audience", "error");
    }
  };

  const openEditCategory = (category: ShopCategory) => {
    setEditingCategoryId(category.id);
    setCategoryForm({
      audienceId: Number(category.audienceId),
      name: category.name,
      slug: category.slug,
      categoryType: category.categoryType || "category",
      displayOrder: Number(category.displayOrder || 0),
      enabled: Boolean(category.enabled),
      hidden: Boolean(category.hidden),
      description: "",
    });
    setCategoryModalOpen(true);
  };

  const saveCategory = async () => {
    const nextSlug = categoryForm.slug || slugify(categoryForm.name);
    const duplicate = taxonomy.categories.some(category => category.id !== editingCategoryId && Number(category.audienceId) === Number(categoryForm.audienceId) && category.slug === nextSlug);
    if (duplicate) { showToast("A category with this name or slug already exists.", "error"); return; }
    if (editingCategoryId) await adminApi.updateShopCategory(editingCategoryId, { ...categoryForm, slug: nextSlug } as any);
    else await adminApi.createShopCategory({ ...categoryForm, slug: nextSlug } as any);
    showToast(editingCategoryId ? "Category updated" : "Category saved");
    setCategoryModalOpen(false);
    setEditingCategoryId(null);
    load();
    onChanged?.();
  };

  const deleteCategory = async (category: ShopCategory) => {
    if (!window.confirm(`Delete category "${category.name}"? This is blocked if products or subcategories are assigned.`)) return;
    try {
      await adminApi.deleteShopCategory(category.id);
      showToast("Category deleted");
      load();
      onChanged?.();
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Could not delete category", "error");
    }
  };

  const toggleCategory = async (category: ShopCategory, changes: Partial<ShopCategory>) => {
    await adminApi.updateShopCategory(category.id, changes);
    showToast("Category updated");
    load();
  };

  const toggleAudience = async (audience: ShopAudience, changes: Partial<ShopAudience>) => {
    await adminApi.updateShopAudience(audience.id, changes);
    showToast("Audience updated");
    load();
  };

  const assignProduct = async () => {
    await adminApi.updateProductClassification(classification.productId, { audienceId: classification.audienceId, categoryId: classification.categoryId || undefined });
    showToast("Product classification saved");
    load();
  };

  const createEvent = async () => {
    await adminApi.createShopEvent({ name: eventName, slug: slugify(eventName) });
    showToast("Event or promotion created");
    setEventName("");
    load();
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.15rem", marginBottom: 6 }}>Shop Management</h2>
        <p style={{ color: "var(--text2)", marginBottom: 16 }}>Simple Printify-style controls for audiences, categories, product classification, and seasonal promotions.</p>
        <div className="shop-management-tabs">
          {[
            ["audiences", "Audiences & Categories"],
            ["products", "Products"],
            ["events", "Events & Promotions"],
          ].map(([value, label]) => (
            <button key={value} className={`admin-nav__tab ${tab === value ? "admin-nav__tab--active" : ""}`} onClick={() => setTab(value as Tab)}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "audiences" && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <h3 style={{ fontSize: "1rem" }}>Audiences & Categories</h3>
            <button className="btn btn-primary btn-sm" onClick={() => openAudienceModal()}>ADD AUDIENCE</button>
          </div>
          <div className="shop-audience-tabs">
            {taxonomy.audiences.map(audience => (
              <button key={audience.id} className={`admin-nav__tab ${selectedAudienceSlug === audience.slug ? "admin-nav__tab--active" : ""}`} onClick={() => setSelectedAudienceSlug(audience.slug)}>
                {audience.name}
              </button>
            ))}
          </div>
          {selectedAudience && (
            <div style={{ display: "grid", gap: 16, marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem" }}>{selectedAudience.name}</h3>
                  <p style={{ color: "var(--text3)" }}>{selectedCategories.length} items • {selectedAudience.enabled ? "Enabled" : "Disabled"} • {selectedAudience.hidden ? "Hidden" : "Visible"}</p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-outline btn-sm" onClick={() => toggleAudience(selectedAudience, { hidden: !Boolean(selectedAudience.hidden) })}>{selectedAudience.hidden ? "Show" : "Hide"}</button>
                  <button className="btn btn-outline btn-sm" onClick={() => toggleAudience(selectedAudience, { enabled: !Boolean(selectedAudience.enabled) })}>{selectedAudience.enabled ? "Disable" : "Enable"}</button>
                  <button className="btn btn-outline btn-sm" onClick={() => openAudienceModal(selectedAudience)}>Edit</button>
                  <button className="btn btn-outline btn-sm" onClick={() => deleteAudience(selectedAudience)}>Delete</button>
                  <button className="btn btn-primary btn-sm" onClick={() => openCategoryModal(selectedAudience.id)}>Add Category</button>
                </div>
              </div>
              {categoryTypes.map(([type, title]) => {
                const items = selectedCategories.filter(c => (c as any).categoryType === type || (type === "category" && !(c as any).categoryType));
                if (items.length === 0 && type !== "category") return null;
                return (
                  <section key={type} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <h4 style={{ fontSize: "0.9rem" }}>{title} ({items.length})</h4>
                      <button className="btn btn-outline btn-sm" onClick={() => openCategoryModal(selectedAudience.id, type)}>Add</button>
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {items.map(category => (
                        <div key={category.id} className="shop-management-row">
                          <div>
                            <strong>{category.name}</strong>
                            <p style={{ color: "var(--text3)", fontSize: "0.75rem" }}>/{category.slug} • order {category.displayOrder}</p>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="btn btn-outline btn-sm" onClick={() => openEditCategory(category)}>Edit</button>
                            <button className="btn btn-outline btn-sm" onClick={() => toggleCategory(category, { hidden: !Boolean(category.hidden) })}>{category.hidden ? "Show" : "Hide"}</button>
                            <button className="btn btn-outline btn-sm" onClick={() => toggleCategory(category, { enabled: !Boolean(category.enabled) })}>{category.enabled ? "Disable" : "Enable"}</button>
                            <button className="btn btn-outline btn-sm" onClick={() => toggleCategory(category, { displayOrder: Number(category.displayOrder || 0) - 1 } as any)}>Move Up</button>
                            <button className="btn btn-outline btn-sm" onClick={() => toggleCategory(category, { displayOrder: Number(category.displayOrder || 0) + 1 } as any)}>Move Down</button>
                            <button className="btn btn-outline btn-sm" onClick={() => deleteCategory(category)}>Delete</button>
                            <button className="btn btn-outline btn-sm" onClick={() => showToast("Assigned products are visible in the Products tab.")}>View Assigned Products</button>
                          </div>
                        </div>
                      ))}
                      {items.length === 0 && <p style={{ color: "var(--text2)" }}>No items yet.</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "products" && (
        <div style={panelStyle}>
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Products</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
            <input className="input" placeholder="Search product name" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            <select className="input" value={filters.audienceId} onChange={e => setFilters(f => ({ ...f, audienceId: Number(e.target.value), categoryId: 0 }))}><option value={0}>All audiences</option>{taxonomy.audiences.filter(a => !a.isForYou).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <select className="input" value={filters.categoryId} onChange={e => setFilters(f => ({ ...f, categoryId: Number(e.target.value) }))}><option value={0}>All categories</option>{taxonomy.categories.filter(c => !filters.audienceId || Number(c.audienceId) === Number(filters.audienceId)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select className="input" value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))}><option value="">All sources</option><option>Printify</option><option>Manual Apparel</option><option>Shopify</option></select>
            <select className="input" value={filters.published} onChange={e => setFilters(f => ({ ...f, published: e.target.value }))}><option value="">Published/Draft</option><option value="published">Published</option><option value="draft">Draft</option></select>
            <select className="input" value={filters.availability} onChange={e => setFilters(f => ({ ...f, availability: e.target.value }))}><option value="">Availability</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {filteredProducts.map(product => (
              <div key={product.id} className="shop-management-row">
                <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  {product.imageUrl && <img src={product.imageUrl.startsWith("[") ? "" : product.imageUrl} alt="" style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 6, background: "var(--bg3)" }} />}
                  <div style={{ minWidth: 0 }}>
                    <strong>{product.name}</strong>
                    <p style={{ color: "var(--text3)", fontSize: "0.76rem" }}>{productSource(product)} • Printify: {product.printifyProductId || "none"} • {productAudience(product)} / {productCategory(product)}</p>
                  </div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setClassification({ productId: product.id, audienceId: taxonomy.audiences.find(a => !a.isForYou)?.id || 0, categoryId: 0 })}>Classify</button>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <select className="input" value={classification.productId} onChange={e => setClassification(f => ({ ...f, productId: Number(e.target.value) }))}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select className="input" value={classification.audienceId} onChange={e => setClassification(f => ({ ...f, audienceId: Number(e.target.value), categoryId: 0 }))}>{taxonomy.audiences.filter(a => !a.isForYou).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <select className="input" value={classification.categoryId} onChange={e => setClassification(f => ({ ...f, categoryId: Number(e.target.value) }))}><option value={0}>Select category</option>{taxonomy.categories.filter(c => Number(c.audienceId) === Number(classification.audienceId)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button className="btn btn-primary btn-sm" onClick={assignProduct} disabled={!classification.productId || !classification.audienceId}>Save Product Classification</button>
          </div>
        </div>
      )}

      {tab === "events" && (
        <div style={panelStyle}>
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Events & Promotions</h3>
          <p style={{ color: "var(--text2)", marginBottom: 12 }}>Create temporary events such as Mother’s Day, Father’s Day, Back to School, 4th of July, Black Friday, or custom Build Level promotions.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input className="input" style={{ maxWidth: 360 }} placeholder="Event or promotion name" value={eventName} onChange={e => setEventName(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={createEvent} disabled={!eventName}>Create Event</button>
          </div>
          <p style={{ color: "var(--text3)", fontSize: "0.8rem", marginTop: 12 }}>Events remain saved in admin. Hide or disable them when no longer relevant; products are never deleted.</p>
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {(taxonomy.events || []).map(event => (
              <div key={event.id} className="shop-management-row">
                <div><strong>{event.name}</strong><p style={{ color: "var(--text3)", fontSize: "0.75rem" }}>/{event.slug} • {event.enabled ? "Enabled" : "Disabled"} • {event.hidden ? "Hidden" : "Visible"}</p></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-outline btn-sm" onClick={async () => { const name = window.prompt("Edit event name", event.name); if (name && name !== event.name) { await adminApi.updateShopEvent(event.id, { name, slug: slugify(name) }); showToast("Event updated"); load(); } }}>Edit</button>
                  <button className="btn btn-outline btn-sm" onClick={async () => { await adminApi.updateShopEvent(event.id, { hidden: !Boolean(event.hidden) }); showToast("Event updated"); load(); }}>{event.hidden ? "Show" : "Hide"}</button>
                  <button className="btn btn-outline btn-sm" onClick={async () => { await adminApi.updateShopEvent(event.id, { enabled: !Boolean(event.enabled) }); showToast("Event updated"); load(); }}>{event.enabled ? "Disable" : "Enable"}</button>
                  <button className="btn btn-outline btn-sm" onClick={async () => { if (window.confirm(`Delete event "${event.name}"? Products will not be deleted.`)) { await adminApi.deleteShopEvent(event.id); showToast("Event deleted"); load(); } }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {audienceModalOpen && (
        <div className="support-modal" role="dialog" aria-modal="true">
          <button className="support-modal__backdrop" onClick={() => setAudienceModalOpen(false)} aria-label="Close audience form" />
          <div className="support-modal__panel">
            <button className="support-modal__close" onClick={() => setAudienceModalOpen(false)} aria-label="Close audience form">×</button>
            <div style={{ display: "grid", gap: 12 }}>
              <h3>{editingAudienceId ? "Edit Audience" : "Add Audience"}</h3>
              <input className="input" placeholder="Name" value={audienceForm.name} onChange={e => setAudienceForm(f => ({ ...f, name: e.target.value, slug: f.slug || slugify(e.target.value) }))} />
              <input className="input" placeholder="Slug" value={audienceForm.slug} onChange={e => setAudienceForm(f => ({ ...f, slug: e.target.value }))} />
              <input className="input" type="number" placeholder="Display order" value={audienceForm.displayOrder} onChange={e => setAudienceForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} />
              <label className="subscribe-interest"><input type="checkbox" checked={audienceForm.enabled} onChange={e => setAudienceForm(f => ({ ...f, enabled: e.target.checked }))} /> Enabled</label>
              <label className="subscribe-interest"><input type="checkbox" checked={!audienceForm.hidden} onChange={e => setAudienceForm(f => ({ ...f, hidden: !e.target.checked }))} /> Visible</label>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" onClick={saveAudience} disabled={!audienceForm.name}>Save</button>
                <button className="btn btn-outline" onClick={() => setAudienceModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {categoryModalOpen && (
        <div className="support-modal" role="dialog" aria-modal="true">
          <button className="support-modal__backdrop" onClick={() => setCategoryModalOpen(false)} aria-label="Close category form" />
          <div className="support-modal__panel">
            <button className="support-modal__close" onClick={() => setCategoryModalOpen(false)} aria-label="Close category form">×</button>
            <div style={{ display: "grid", gap: 12 }}>
              <h3>{editingCategoryId ? "Edit Category" : "Add Category"}</h3>
              <select className="input" value={categoryForm.audienceId} onChange={e => setCategoryForm(f => ({ ...f, audienceId: Number(e.target.value) }))}>{taxonomy.audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <input className="input" placeholder="Category or section name" value={categoryForm.name} onChange={e => setCategoryForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))} />
              <input className="input" placeholder="Slug" value={categoryForm.slug} onChange={e => setCategoryForm(f => ({ ...f, slug: e.target.value }))} />
              <select className="input" value={(categoryForm as any).categoryType} onChange={e => setCategoryForm(f => ({ ...f, categoryType: e.target.value }))}>
                <option value="category">Standard Category</option><option value="featured_box">Featured Box</option><option value="trend">Trend</option><option value="recommended">Recommended</option><option value="event">Temporary Event</option>
              </select>
              <input className="input" type="number" placeholder="Display order" value={categoryForm.displayOrder} onChange={e => setCategoryForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} />
              <textarea className="input" rows={3} placeholder="Optional description" value={categoryForm.description} onChange={e => setCategoryForm(f => ({ ...f, description: e.target.value }))} />
              <label className="subscribe-interest"><input type="checkbox" checked={categoryForm.enabled} onChange={e => setCategoryForm(f => ({ ...f, enabled: e.target.checked }))} /> Enabled</label>
              <label className="subscribe-interest"><input type="checkbox" checked={!categoryForm.hidden} onChange={e => setCategoryForm(f => ({ ...f, hidden: !e.target.checked }))} /> Visible</label>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" onClick={saveCategory}>Save</button>
                <button className="btn btn-outline" onClick={() => setCategoryModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
