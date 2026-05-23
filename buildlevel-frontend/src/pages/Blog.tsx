import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BLOG_CATEGORIES, getBlogCategoryLabel, normalizeBlogCategory } from "../lib/blogCategories";
import { publicApi, BlogPost } from "../lib/api";

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const activeCategory = normalizeBlogCategory(searchParams.get("category"));

  useEffect(() => {
    publicApi.getBlogPosts().then(p => { setPosts(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const categoryCounts = posts.reduce<Record<string, number>>((counts, post) => {
    const category = normalizeBlogCategory(post.category);
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const activeKnownCategory = searchParams.get("category") ? activeCategory : "";
  const visibleCategories = BLOG_CATEGORIES.filter(category => categoryCounts[category.slug] || !posts.length);
  const customCategories = Object.keys(categoryCounts).filter(category => !BLOG_CATEGORIES.some(known => known.slug === category));
  const filteredPosts = activeKnownCategory ? posts.filter(post => normalizeBlogCategory(post.category) === activeKnownCategory) : posts;

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "48px 0 32px" }}>
        <div className="container">
          <h1 style={{ marginBottom: 8 }}>The Journal</h1>
          <p style={{ color: "var(--text2)" }}>Insights on discipline, focus, and execution.</p>
        </div>
      </div>

      <div className="container section-sm">
        <nav aria-label="Blog categories" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 32 }}>
          <Link to="/blog" className="btn btn-sm" style={{
            background: !activeKnownCategory ? "var(--red)" : "var(--bg3)",
            color: !activeKnownCategory ? "#fff" : "var(--text2)",
            border: "1px solid var(--border)",
          }}>All Articles</Link>
          {[...visibleCategories.map(category => category.slug), ...customCategories].map(category => (
            <Link key={category} to={`/blog?category=${category}`} className="btn btn-sm" style={{
              background: activeKnownCategory === category ? "var(--red)" : "transparent",
              color: activeKnownCategory === category ? "#fff" : "var(--text2)",
              border: "1px solid var(--border)",
            }}>
              {getBlogCategoryLabel(category)} {categoryCounts[category] ? `(${categoryCounts[category]})` : ""}
            </Link>
          ))}
        </nav>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><div className="spinner" /></div>
        ) : filteredPosts.length === 0 ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--text2)" }}>
            <p style={{ fontSize: "1.1rem", marginBottom: 8 }}>{posts.length === 0 ? "No posts yet." : `No ${getBlogCategoryLabel(activeKnownCategory)} posts yet.`}</p>
            <p style={{ fontSize: "0.9rem" }}>{posts.length === 0 ? "Check back soon." : "Try another category."}</p>
          </div>
        ) : (
          <div className="grid-3">
            {filteredPosts.map(p => {
              const category = normalizeBlogCategory(p.category);
              return (
              <article key={p.id} className="card" style={{ height: "100%" }}>
                <Link to={`/blog/${p.slug}`} style={{ textDecoration: "none" }}>
                  {p.imageUrl && (
                    <div style={{ aspectRatio: "16/9", overflow: "hidden" }}>
                      <img src={p.imageUrl} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s" }}
                        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.05)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")} />
                    </div>
                  )}
                </Link>
                  <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                      <Link to={`/blog?category=${category}`} className="badge badge-dark" style={{ textDecoration: "none" }}>{getBlogCategoryLabel(category)}</Link>
                      {p.readTime && <span style={{ color: "var(--text3)", fontSize: "0.75rem" }}>{p.readTime}</span>}
                    </div>
                    <Link to={`/blog/${p.slug}`} style={{ textDecoration: "none" }}>
                      <h3 style={{ fontSize: "1rem", marginBottom: 8, lineHeight: 1.3 }}>{p.title}</h3>
                    </Link>
                    {p.excerpt && <p style={{ color: "var(--text2)", fontSize: "0.85rem", lineHeight: 1.6 }}>{p.excerpt}</p>}
                    <p style={{ color: "var(--text3)", fontSize: "0.75rem", marginTop: 12 }}>
                      {new Date(p.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
              </article>
            )})}
          </div>
        )}
      </div>
    </div>
  );
}
