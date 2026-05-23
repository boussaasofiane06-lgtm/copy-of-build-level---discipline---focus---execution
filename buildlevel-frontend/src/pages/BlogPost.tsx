import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { publicApi, BlogPost } from "../lib/api";
import { getBlogCategoryLabel, normalizeBlogCategory } from "../lib/blogCategories";

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    publicApi.getBlogPost(slug)
      .then(p => { setPost(p); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [slug]);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 120 }}><div className="spinner" /></div>;
  if (notFound || !post) return (
    <div style={{ textAlign: "center", padding: 120 }}>
      <h2 style={{ marginBottom: 16 }}>Post Not Found</h2>
      <Link to="/blog" className="btn btn-primary">Back to Journal</Link>
    </div>
  );

  return (
    <div>
      {post.imageUrl && (
        <div style={{ height: 400, overflow: "hidden" }}>
          <img src={post.imageUrl} alt={post.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      <div className="container" style={{ maxWidth: 720, padding: "64px 24px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
          <Link to="/blog" style={{ color: "var(--text3)", fontSize: "0.85rem" }}>← Journal</Link>
          <span style={{ color: "var(--text3)" }}>/</span>
          <Link to={`/blog?category=${normalizeBlogCategory(post.category)}`} className="badge badge-dark" style={{ textDecoration: "none" }}>{getBlogCategoryLabel(post.category)}</Link>
        </div>
        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", marginBottom: 16 }}>{post.title}</h1>
        <div style={{ display: "flex", gap: 16, color: "var(--text3)", fontSize: "0.8rem", marginBottom: 40 }}>
          <span>{new Date(post.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
          {post.readTime && <span>· {post.readTime}</span>}
        </div>
        {post.content ? (
          <div style={{ color: "var(--text2)", lineHeight: 1.9, fontSize: "1.05rem" }}
            dangerouslySetInnerHTML={{ __html: post.content.replace(/\n/g, "<br />") }} />
        ) : (
          <p style={{ color: "var(--text2)" }}>{post.excerpt}</p>
        )}
      </div>
    </div>
  );
}
