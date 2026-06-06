import { useEffect, useState } from "react";
import { Product, ShopAudience, ShopCategory, ShopTaxonomy, adminApi } from "../lib/api";

const panelStyle: React.CSSProperties = { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 };

function slugify(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function AdminShopOrganizationPanel({ products, showToast }: { products: Product[]; showToast: (message: string, type?: "success" | "error") => void }) {
  const [taxonomy, setTaxonomy] = useState<ShopTaxonomy>({ audiences: [], categories: [], productAssignments: [] });
  const [audienceForm, setAudienceForm] = useState({ name: "", slug: "", displayOrder: 0, enabled: true, hidden: false, isForYou: false });
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", audienceId: 0, parentId: 0, enabled: true, hidden: false });
  const [quickName, setQuickName] = useState("");
  const [quickType, setQuickType] = useState<"trends" | "events" | "recommended-groups" | "collections">("trends");
  const [classification, setClassification] = useState({ productId: 0, audienceId: 0, categoryId: 0, subcategoryId: 0 });

  const load = async () => {
    try {
      const data = await adminApi.getShopTaxonomy();
      setTaxonomy(data);
      setCategoryForm(current => ({ ...current, audienceId: current.audienceId || data.audiences.find(a => a.slug === "home-living")?.id || data.audiences[0]?.id || 0 }));
      setClassification(current => ({ ...current, productId: current.productId || products[0]?.id || 0, audienceId: current.audienceId || data.audiences[0]?.id || 0 }));
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Failed to load shop organization", "error");
    }
  };

  useEffect(() => { load(); }, []);

  const saveAudience = async () => {
    await adminApi.createShopAudience({ ...audienceForm, slug: audienceForm.slug || slugify(audienceForm.name) });
    showToast("Audience created");
    setAudienceForm({ name: "", slug: "", displayOrder: 0, enabled: true, hidden: false, isForYou: false });
    load();
  };

  const toggleAudience = async (audience: ShopAudience, changes: Partial<ShopAudience>) => {
    await adminApi.updateShopAudience(audience.id, changes);
    showToast("Audience updated");
    load();
  };

  const saveCategory = async () => {
    await adminApi.createShopCategory({ ...categoryForm, slug: categoryForm.slug || slugify(categoryForm.name), parentId: categoryForm.parentId || null });
    showToast("Category created");
    setCategoryForm(current => ({ ...current, name: "", slug: "", parentId: 0 }));
    load();
  };

  const toggleCategory = async (category: ShopCategory, changes: Partial<ShopCategory>) => {
    await adminApi.updateShopCategory(category.id, changes);
    showToast("Category updated");
    load();
  };

  const saveQuick = async () => {
    const data = { name: quickName, slug: slugify(quickName) };
    if (quickType === "trends") await adminApi.createShopTrend(data);
    if (quickType === "events") await adminApi.createShopEvent(data);
    if (quickType === "recommended-groups") await adminApi.createRecommendedGroup(data);
    if (quickType === "collections") await adminApi.createShopCollection(data);
    showToast("Shop item created");
    setQuickName("");
  };

  const assignProduct = async () => {
    await adminApi.updateProductClassification(classification.productId, {
      audienceId: classification.audienceId,
      categoryId: classification.categoryId || undefined,
      subcategoryId: classification.subcategoryId || undefined,
    });
    showToast("Product classification saved");
    load();
  };

  const selectedAudienceCategories = taxonomy.categories.filter(c => Number(c.audienceId) === Number(categoryForm.audienceId) && !c.parentId);
  const assignmentCategories = taxonomy.categories.filter(c => Number(c.audienceId) === Number(classification.audienceId));
  const assignmentParents = assignmentCategories.filter(c => !c.parentId);
  const assignmentChildren = assignmentCategories.filter(c => c.parentId);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Shop Navigation</h2>
        <p style={{ color: "var(--text2)", marginBottom: 14 }}>Manage public audiences including For You, Men, Women, Kids, Accessories, and Home & Living.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
          <input className="input" placeholder="Audience name" value={audienceForm.name} onChange={e => setAudienceForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input" placeholder="Slug" value={audienceForm.slug} onChange={e => setAudienceForm(f => ({ ...f, slug: e.target.value }))} />
          <input className="input" type="number" placeholder="Order" value={audienceForm.displayOrder} onChange={e => setAudienceForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} />
          <label className="subscribe-interest"><input type="checkbox" checked={audienceForm.isForYou} onChange={e => setAudienceForm(f => ({ ...f, isForYou: e.target.checked }))} /> For You section</label>
          <button className="btn btn-primary btn-sm" onClick={saveAudience} disabled={!audienceForm.name}>Add Audience</button>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {taxonomy.audiences.map(audience => (
            <div key={audience.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div><strong>{audience.name}</strong><p style={{ color: "var(--text3)", fontSize: "0.78rem" }}>{audience.slug} • order {audience.displayOrder} {audience.isForYou ? "• Optional For You" : ""}</p></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-outline btn-sm" onClick={() => toggleAudience(audience, { hidden: !Boolean(audience.hidden) })}>{audience.hidden ? "Show" : "Hide"}</button>
                <button className="btn btn-outline btn-sm" onClick={() => toggleAudience(audience, { enabled: !Boolean(audience.enabled) })}>{audience.enabled ? "Disable" : "Enable"}</button>
                <button className="btn btn-outline btn-sm" onClick={() => toggleAudience(audience, { featured: !Boolean(audience.featured) })}>{audience.featured ? "Unfeature" : "Feature"}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Shop Categories & Subcategories</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
          <select className="input" value={categoryForm.audienceId} onChange={e => setCategoryForm(f => ({ ...f, audienceId: Number(e.target.value), parentId: 0 }))}>{taxonomy.audiences.filter(a => !a.isForYou).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select className="input" value={categoryForm.parentId} onChange={e => setCategoryForm(f => ({ ...f, parentId: Number(e.target.value) }))}><option value={0}>Top-level category</option>{selectedAudienceCategories.map(c => <option key={c.id} value={c.id}>Subcategory of {c.name}</option>)}</select>
          <input className="input" placeholder="Category name" value={categoryForm.name} onChange={e => setCategoryForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input" placeholder="Slug" value={categoryForm.slug} onChange={e => setCategoryForm(f => ({ ...f, slug: e.target.value }))} />
          <button className="btn btn-primary btn-sm" onClick={saveCategory} disabled={!categoryForm.name}>Add Category</button>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {taxonomy.categories.map(category => (
            <div key={category.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>{category.name} <span style={{ color: "var(--text3)" }}>/{category.slug}</span></span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => toggleCategory(category, { hidden: !Boolean(category.hidden) })}>{category.hidden ? "Show" : "Hide"}</button>
                <button className="btn btn-outline btn-sm" onClick={() => toggleCategory(category, { enabled: !Boolean(category.enabled) })}>{category.enabled ? "Disable" : "Enable"}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Product Assignment</h2>
        <p style={{ color: "var(--text2)", marginBottom: 12 }}>Assign products without duplicating records. Printify IDs, reviews, carts, orders, and variants remain unchanged.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
          <select className="input" value={classification.productId} onChange={e => setClassification(f => ({ ...f, productId: Number(e.target.value) }))}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select className="input" value={classification.audienceId} onChange={e => setClassification(f => ({ ...f, audienceId: Number(e.target.value), categoryId: 0, subcategoryId: 0 }))}>{taxonomy.audiences.filter(a => !a.isForYou).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select className="input" value={classification.categoryId} onChange={e => setClassification(f => ({ ...f, categoryId: Number(e.target.value) }))}><option value={0}>Category</option>{assignmentParents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className="input" value={classification.subcategoryId} onChange={e => setClassification(f => ({ ...f, subcategoryId: Number(e.target.value) }))}><option value={0}>Subcategory</option>{assignmentChildren.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button className="btn btn-primary btn-sm" onClick={assignProduct} disabled={!classification.productId || !classification.audienceId}>Save Assignment</button>
        </div>
      </div>

      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Collections, Trends, Events & Recommended Groups</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select className="input" style={{ maxWidth: 220 }} value={quickType} onChange={e => setQuickType(e.target.value as any)}><option value="collections">Collection</option><option value="trends">Trend</option><option value="events">Event / Seasonal Campaign</option><option value="recommended-groups">Recommended Group</option></select>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Name" value={quickName} onChange={e => setQuickName(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={saveQuick} disabled={!quickName}>Create</button>
        </div>
      </div>
    </div>
  );
}
