import { useEffect, useState } from "react";
import { Product, ShopAudience, ShopCategory, ShopTaxonomy, adminApi } from "../lib/api";

const panelStyle: React.CSSProperties = { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 };
const defaultStyle = {
  textCase: "keep",
  fontStyle: "regular",
  fontSize: "16",
  fontWeight: "600",
  letterSpacing: "0.08",
  lineHeight: "1.3",
  textAlign: "left",
  textColor: "#f0ede8",
  headingColor: "#ffffff",
  backgroundColor: "#111111",
  borderColor: "#2a2a2a",
  buttonColor: "#c0392b",
  buttonTextColor: "#ffffff",
  badgeBackgroundColor: "#c0392b",
  badgeTextColor: "#ffffff",
  accentColor: "#ff6600",
  buttonVariant: "filled",
  buttonSize: "medium",
  buttonWidth: "auto",
  buttonRadius: "4",
  badgeText: "Featured",
};

function slugify(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function CollapsibleList<T>({
  title,
  items,
  renderItem,
  getKey,
  initialVisible = 3,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  getKey: (item: T) => string | number;
  initialVisible?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll || items.length <= initialVisible ? items : items.slice(0, initialVisible);
  const remaining = Math.max(0, items.length - initialVisible);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: "0.82rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {title} — {items.length}
        </strong>
        {items.length > initialVisible && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowAll(current => !current)}>
            {showAll ? "Show Less" : `Show All ${remaining} More`}
          </button>
        )}
      </div>
      {visible.map(item => <div key={getKey(item)}>{renderItem(item)}</div>)}
    </div>
  );
}

export default function AdminShopOrganizationPanel({ products, showToast }: { products: Product[]; showToast: (message: string, type?: "success" | "error") => void }) {
  const [taxonomy, setTaxonomy] = useState<ShopTaxonomy>({ audiences: [], categories: [], productAssignments: [] });
  const [audienceForm, setAudienceForm] = useState({ name: "", slug: "", displayOrder: 0, enabled: true, hidden: false, isForYou: false });
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", audienceId: 0, parentId: 0, enabled: true, hidden: false });
  const [quickName, setQuickName] = useState("");
  const [quickType, setQuickType] = useState<"trends" | "events" | "recommended-groups" | "collections">("trends");
  const [classification, setClassification] = useState({ productId: 0, audienceId: 0, categoryId: 0, subcategoryId: 0 });
  const [styleTarget, setStyleTarget] = useState({ type: "audience" as "audience" | "category", id: 0 });
  const [styleForm, setStyleForm] = useState<Record<string, string | boolean>>(defaultStyle);
  const [expandedAudiences, setExpandedAudiences] = useState<Record<number, boolean>>({});
  const [orgSearch, setOrgSearch] = useState("");

  const load = async () => {
    try {
      const data = await adminApi.getShopTaxonomy();
      const audiences = Array.from(new Map(data.audiences.map(item => [item.slug, item])).values());
      const categories = Array.from(new Map(data.categories.map(item => [`${item.audienceId}:${item.parentId || 0}:${item.slug}`, item])).values());
      const productAssignments = Array.from(new Map(data.productAssignments.map(item => [`${item.productId}:${item.audienceSlug}:${item.assignmentType || ""}:${item.categorySlug || ""}`, item])).values());
      setTaxonomy({ audiences, categories, productAssignments });
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
    const nextSlug = categoryForm.slug || slugify(categoryForm.name);
    const duplicate = taxonomy.categories.some(category =>
      Number(category.audienceId) === Number(categoryForm.audienceId) &&
      Number(category.parentId || 0) === Number(categoryForm.parentId || 0) &&
      (category.slug === nextSlug || category.name.trim().toLowerCase() === categoryForm.name.trim().toLowerCase())
    );
    if (duplicate) {
      showToast("A category with this name or slug already exists.", "error");
      return;
    }
    await adminApi.createShopCategory({ ...categoryForm, slug: nextSlug, parentId: categoryForm.parentId || null });
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

  const parseStyle = (value: unknown) => {
    if (!value) return {};
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch { return {}; }
    }
    return value as Record<string, string | boolean>;
  };

  const selectStyleTarget = (type: "audience" | "category", id: number) => {
    setStyleTarget({ type, id });
    const source = type === "audience" ? taxonomy.audiences.find(item => item.id === id) : taxonomy.categories.find(item => item.id === id);
    setStyleForm({ ...defaultStyle, ...parseStyle(source?.styleSettings) });
  };

  const textWithCase = (text: string) => {
    if (styleForm.textCase === "uppercase") return text.toUpperCase();
    if (styleForm.textCase === "lowercase") return text.toLowerCase();
    if (styleForm.textCase === "title") return text.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
    if (styleForm.textCase === "sentence") return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    return text;
  };

  const contrastWarning = String(styleForm.textColor).toLowerCase() === String(styleForm.backgroundColor).toLowerCase();

  const saveStyle = async () => {
    if (!styleTarget.id) { showToast("Select an audience or category first", "error"); return; }
    if (styleTarget.type === "audience") await adminApi.updateShopAudience(styleTarget.id, { styleSettings: styleForm } as any);
    else await adminApi.updateShopCategory(styleTarget.id, { styleSettings: styleForm } as any);
    showToast("Style settings saved");
    load();
  };

  const resetStyle = () => setStyleForm(defaultStyle);

  const selectedAudienceCategories = taxonomy.categories.filter(c => Number(c.audienceId) === Number(categoryForm.audienceId) && !c.parentId);
  const assignmentCategories = taxonomy.categories.filter(c => Number(c.audienceId) === Number(classification.audienceId));
  const assignmentParents = assignmentCategories.filter(c => !c.parentId);
  const assignmentChildren = assignmentCategories.filter(c => c.parentId);
  const normalizedSearch = orgSearch.trim().toLowerCase();
  const matchesSearch = (parts: Array<string | number | null | undefined>) => !normalizedSearch || parts.some(part => String(part || "").toLowerCase().includes(normalizedSearch));
  const parentCategoriesForAudience = (audienceId: number) => taxonomy.categories.filter(c => Number(c.audienceId) === Number(audienceId) && !c.parentId && matchesSearch([c.name, c.slug]));
  const childCategoriesFor = (parentId: number) => taxonomy.categories.filter(c => Number(c.parentId) === Number(parentId) && matchesSearch([c.name, c.slug]));
  const filteredAudiences = taxonomy.audiences.filter(audience => {
    const categories = taxonomy.categories.filter(category => Number(category.audienceId) === Number(audience.id));
    return matchesSearch([audience.name, audience.slug]) || categories.some(category => matchesSearch([category.name, category.slug, audience.name]));
  });
  const isAudienceExpanded = (audience: ShopAudience) => Boolean(expandedAudiences[audience.id]) || !!normalizedSearch;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Shop Navigation</h2>
        <p style={{ color: "var(--text2)", marginBottom: 14 }}>Manage public audiences including For You, Men, Women, Kids, Accessories, and Home & Living.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <input className="input" style={{ maxWidth: 380 }} placeholder="Search audiences, categories, subcategories" value={orgSearch} onChange={e => setOrgSearch(e.target.value)} />
          <button className="btn btn-outline btn-sm" onClick={() => setExpandedAudiences(Object.fromEntries(taxonomy.audiences.map(a => [a.id, true])))}>Expand All</button>
          <button className="btn btn-outline btn-sm" onClick={() => setExpandedAudiences({})}>Collapse All</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
          <input className="input" placeholder="Audience name" value={audienceForm.name} onChange={e => setAudienceForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input" placeholder="Slug" value={audienceForm.slug} onChange={e => setAudienceForm(f => ({ ...f, slug: e.target.value }))} />
          <input className="input" type="number" placeholder="Order" value={audienceForm.displayOrder} onChange={e => setAudienceForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} />
          <label className="subscribe-interest"><input type="checkbox" checked={audienceForm.isForYou} onChange={e => setAudienceForm(f => ({ ...f, isForYou: e.target.checked }))} /> For You section</label>
          <button className="btn btn-primary btn-sm" onClick={saveAudience} disabled={!audienceForm.name}>Add Audience</button>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {filteredAudiences.map(audience => {
            const categories = parentCategoriesForAudience(audience.id);
            const expanded = isAudienceExpanded(audience);
            return (
              <div key={audience.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
                <button
                  type="button"
                  onClick={() => setExpandedAudiences(current => ({ ...current, [audience.id]: !expanded }))}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: 14, background: expanded ? "rgba(255,102,0,0.08)" : "transparent", color: "var(--text)", border: 0, textAlign: "left" }}
                >
                  <div>
                    <strong style={{ fontFamily: "var(--font-display)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{audience.name}</strong>
                    <p style={{ color: "var(--text3)", fontSize: "0.78rem" }}>{categories.length} Categories • {audience.enabled ? "Enabled" : "Disabled"} • {audience.hidden ? "Hidden" : "Visible"} {audience.isForYou ? "• Optional For You" : ""}</p>
                  </div>
                  <span style={{ color: "var(--red)", fontSize: "1.1rem" }}>{expanded ? "▲" : "▼"}</span>
                </button>
                {expanded && (
                  <div style={{ padding: 14, display: "grid", gap: 12, borderTop: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-outline btn-sm" onClick={() => toggleAudience(audience, { hidden: !Boolean(audience.hidden) })}>{audience.hidden ? "Show" : "Hide"}</button>
                      <button className="btn btn-outline btn-sm" onClick={() => toggleAudience(audience, { enabled: !Boolean(audience.enabled) })}>{audience.enabled ? "Disable" : "Enable"}</button>
                      <button className="btn btn-outline btn-sm" onClick={() => toggleAudience(audience, { featured: !Boolean(audience.featured) })}>{audience.featured ? "Unfeature" : "Feature"}</button>
                      <button className="btn btn-outline btn-sm" onClick={() => selectStyleTarget("audience", audience.id)}>Style</button>
                      <button className="btn btn-primary btn-sm" onClick={() => setCategoryForm(f => ({ ...f, audienceId: audience.id, parentId: 0 }))}>Add Category Here</button>
                    </div>
                    <CollapsibleList
                      title={`${audience.name} Categories`}
                      items={categories}
                      getKey={category => category.id}
                      renderItem={category => {
                        const children = childCategoriesFor(category.id);
                        return (
                          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <span style={{ overflowWrap: "anywhere" }}>{category.name} <span style={{ color: "var(--text3)" }}>/{category.slug}</span></span>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button className="btn btn-outline btn-sm" onClick={() => toggleCategory(category, { hidden: !Boolean(category.hidden) })}>{category.hidden ? "Show" : "Hide"}</button>
                                <button className="btn btn-outline btn-sm" onClick={() => toggleCategory(category, { enabled: !Boolean(category.enabled) })}>{category.enabled ? "Disable" : "Enable"}</button>
                                <button className="btn btn-outline btn-sm" onClick={() => selectStyleTarget("category", category.id)}>Style</button>
                                <button className="btn btn-primary btn-sm" onClick={() => setCategoryForm(f => ({ ...f, audienceId: audience.id, parentId: category.id }))}>Add Subcategory</button>
                              </div>
                            </div>
                            {children.length > 0 && (
                              <CollapsibleList
                                title={`${category.name} Subcategories`}
                                items={children}
                                getKey={child => child.id}
                                renderItem={child => (
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: 8, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}>
                                    <span>{child.name} <span style={{ color: "var(--text3)" }}>/{child.slug}</span></span>
                                    <button className="btn btn-outline btn-sm" onClick={() => selectStyleTarget("category", child.id)}>Style</button>
                                  </div>
                                )}
                              />
                            )}
                          </div>
                        );
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Shop Categories & Subcategories</h2>
        <p style={{ color: "var(--text2)", marginBottom: 12 }}>Use this compact form to add a category or subcategory to the selected audience. Existing categories are managed inside each audience accordion above.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
          <select className="input" value={categoryForm.audienceId} onChange={e => setCategoryForm(f => ({ ...f, audienceId: Number(e.target.value), parentId: 0 }))}>{taxonomy.audiences.filter(a => !a.isForYou).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select className="input" value={categoryForm.parentId} onChange={e => setCategoryForm(f => ({ ...f, parentId: Number(e.target.value) }))}><option value={0}>Top-level category</option>{selectedAudienceCategories.map(c => <option key={c.id} value={c.id}>Subcategory of {c.name}</option>)}</select>
          <input className="input" placeholder="Category name" value={categoryForm.name} onChange={e => setCategoryForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input" placeholder="Slug" value={categoryForm.slug} onChange={e => setCategoryForm(f => ({ ...f, slug: e.target.value }))} />
          <button className="btn btn-primary btn-sm" onClick={saveCategory} disabled={!categoryForm.name}>Add Category</button>
        </div>
      </div>

      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>Text, Color, Button & Badge Style Customization</h2>
        <p style={{ color: "var(--text2)", marginBottom: 14 }}>Select Style on any audience or category above, preview changes, then publish. Unsafe CSS and scripts are not accepted.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          <label><span>Text case</span><select className="input" value={String(styleForm.textCase)} onChange={e => setStyleForm(f => ({ ...f, textCase: e.target.value }))}><option value="uppercase">UPPERCASE</option><option value="lowercase">lowercase</option><option value="title">Title Case</option><option value="sentence">Sentence case</option><option value="keep">Keep as entered</option></select></label>
          <label><span>Font style</span><select className="input" value={String(styleForm.fontStyle)} onChange={e => setStyleForm(f => ({ ...f, fontStyle: e.target.value }))}><option value="regular">Regular</option><option value="bold">Bold</option><option value="semibold">Semi-bold</option><option value="light">Light</option><option value="italic">Italic</option><option value="underline">Underline</option><option value="strike">Strikethrough</option></select></label>
          <label><span>Font size</span><input className="input" type="number" min={10} max={42} value={String(styleForm.fontSize)} onChange={e => setStyleForm(f => ({ ...f, fontSize: e.target.value }))} /></label>
          <label><span>Font weight</span><input className="input" type="number" min={300} max={900} value={String(styleForm.fontWeight)} onChange={e => setStyleForm(f => ({ ...f, fontWeight: e.target.value }))} /></label>
          <label><span>Letter spacing</span><input className="input" value={String(styleForm.letterSpacing)} onChange={e => setStyleForm(f => ({ ...f, letterSpacing: e.target.value }))} /></label>
          <label><span>Line height</span><input className="input" value={String(styleForm.lineHeight)} onChange={e => setStyleForm(f => ({ ...f, lineHeight: e.target.value }))} /></label>
          <label><span>Text align</span><select className="input" value={String(styleForm.textAlign)} onChange={e => setStyleForm(f => ({ ...f, textAlign: e.target.value }))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          {["textColor", "headingColor", "backgroundColor", "borderColor", "buttonColor", "buttonTextColor", "badgeBackgroundColor", "badgeTextColor", "accentColor"].map(key => (
            <label key={key}><span>{key}</span><input className="input" type="color" value={String(styleForm[key] || "#ffffff")} onChange={e => setStyleForm(f => ({ ...f, [key]: e.target.value }))} /></label>
          ))}
          <label><span>Button variant</span><select className="input" value={String(styleForm.buttonVariant)} onChange={e => setStyleForm(f => ({ ...f, buttonVariant: e.target.value }))}><option value="filled">Filled</option><option value="outlined">Outlined</option><option value="text">Text-only</option></select></label>
          <label><span>Button size</span><select className="input" value={String(styleForm.buttonSize)} onChange={e => setStyleForm(f => ({ ...f, buttonSize: e.target.value }))}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
          <label><span>Button width</span><select className="input" value={String(styleForm.buttonWidth)} onChange={e => setStyleForm(f => ({ ...f, buttonWidth: e.target.value }))}><option value="auto">Automatic</option><option value="full">Full width</option></select></label>
          <label><span>Badge text</span><input className="input" value={String(styleForm.badgeText)} onChange={e => setStyleForm(f => ({ ...f, badgeText: e.target.value }))} /></label>
        </div>
        {contrastWarning && <p style={{ color: "var(--red)", marginTop: 12 }}>Contrast warning: text and background colors are too similar.</p>}
        <div style={{ marginTop: 16, padding: 18, border: `1px solid ${styleForm.borderColor}`, background: String(styleForm.backgroundColor), color: String(styleForm.textColor), textAlign: styleForm.textAlign as any, borderRadius: 10 }}>
          <span style={{ display: "inline-block", padding: "4px 8px", marginBottom: 10, color: String(styleForm.badgeTextColor), background: String(styleForm.badgeBackgroundColor), borderRadius: 4 }}>{textWithCase(String(styleForm.badgeText || "Featured"))}</span>
          <h3 style={{ color: String(styleForm.headingColor), fontSize: `${styleForm.fontSize}px`, fontWeight: Number(styleForm.fontWeight), letterSpacing: `${styleForm.letterSpacing}em`, lineHeight: String(styleForm.lineHeight), fontStyle: styleForm.fontStyle === "italic" ? "italic" : "normal", textDecoration: styleForm.fontStyle === "underline" ? "underline" : styleForm.fontStyle === "strike" ? "line-through" : "none" }}>{textWithCase("Preview Heading")}</h3>
          <p>This preview checks desktop and mobile-safe colors, text case, spacing, badges, and button style.</p>
          <button className="btn" style={{ marginTop: 10, width: styleForm.buttonWidth === "full" ? "100%" : "auto", background: styleForm.buttonVariant === "outlined" || styleForm.buttonVariant === "text" ? "transparent" : String(styleForm.buttonColor), border: styleForm.buttonVariant === "text" ? "0" : `1px solid ${styleForm.buttonColor}`, color: String(styleForm.buttonTextColor), borderRadius: `${styleForm.buttonRadius}px` }}>{textWithCase("Shop Now")}</button>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button className="btn btn-primary btn-sm" onClick={saveStyle}>Save Style</button>
          <button className="btn btn-outline btn-sm" onClick={resetStyle}>Use Build Level Default Style</button>
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
