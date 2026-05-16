import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { publicApi, BlogPost } from "../lib/api";

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    publicApi.getBlogPosts().then(p => { setPosts(p); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "48px 0 32px" }}>
        <div className="container">
          <h1 style={{ marginBottom: 8 }}>The Journal</h1>
          <p style={{ color: "var(--text2)" }}>Insights on discipline, focus, and execution.</p>
        </div>
      </div>

      <div className="container section-sm">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><div className="spinner" /></div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--text2)" }}>
            <p style={{ fontSize: "1.1rem", marginBottom: 8 }}>No posts yet.</p>
            <p style={{ fontSize: "0.9rem" }}>Check back soon.</p>
          </div>
        ) : (
          <div className="grid-3">
            {posts.map(p => (
              <Link key={p.id} to={`/blog/${p.slug}`} style={{ textDecoration: "none" }}>
                <div className="card" style={{ height: "100%" }}>
                  {p.imageUrl && (
                    <div style={{ aspectRatio: "16/9", overflow: "hidden" }}>
                      <img src={p.imageUrl} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.3s" }}
                        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.05)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")} />
                    </div>
                  )}
                  <div style={{ padding: 20 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                      <span className="badge badge-dark">{p.category}</span>
                      {p.readTime && <span style={{ color: "var(--text3)", fontSize: "0.75rem" }}>{p.readTime}</span>}
                    </div>
                    <h3 style={{ fontSize: "1rem", marginBottom: 8, lineHeight: 1.3 }}>{p.title}</h3>
                    {p.excerpt && <p style={{ color: "var(--text2)", fontSize: "0.85rem", lineHeight: 1.6 }}>{p.excerpt}</p>}
                    <p style={{ color: "var(--text3)", fontSize: "0.75rem", marginTop: 12 }}>
                      {new Date(p.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
