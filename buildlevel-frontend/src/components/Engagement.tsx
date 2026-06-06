import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { publicApi, BlogComment, BlogEngagement as BlogEngagementData, Review } from "../lib/api";

export function getEngagementSessionId() {
  const key = "buildlevel_engagement_session";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, value);
  }
  return value;
}

export function Stars({ value, onSelect, size = 18 }: { value: number; onSelect?: (value: number) => void; size?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onSelect?.(star)}
          disabled={!onSelect}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          style={{ border: 0, background: "transparent", color: star <= Math.round(value) ? "#ff6600" : "var(--text3)", fontSize: size, lineHeight: 1, padding: onSelect ? 2 : 0, cursor: onSelect ? "pointer" : "default" }}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export type ReviewSummaryData = {
  reviews: Review[];
  averageRating: number;
  count: number;
};

export function ProductReviewSummary({ summary, compact = false }: { summary?: ReviewSummaryData; compact?: boolean }) {
  const average = summary?.averageRating || 0;
  const count = summary?.count || 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text2)", fontSize: compact ? "0.74rem" : "0.85rem", flexWrap: "wrap" }}>
      <Stars value={average} size={compact ? 13 : 17} />
      <span>{average ? average.toFixed(1) : "0.0"}</span>
      <span style={{ color: "var(--text3)" }}>Based on {count} verified review{count === 1 ? "" : "s"}</span>
    </div>
  );
}

export function RatingBreakdown({ reviews }: { reviews: Review[] }) {
  const total = reviews.length || 0;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {[5, 4, 3, 2, 1].map(star => {
        const count = reviews.filter(review => review.rating === star).length;
        const width = total ? `${Math.round((count / total) * 100)}%` : "0%";
        return (
          <div key={star} style={{ display: "grid", gridTemplateColumns: "52px 1fr 32px", gap: 8, alignItems: "center", color: "var(--text3)", fontSize: "0.75rem" }}>
            <span>{star} star</span>
            <span style={{ height: 7, background: "var(--bg3)", borderRadius: 999, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width, background: "#ff6600" }} />
            </span>
            <span>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TrustBadges({ type }: { type: "apparel" | "digital" }) {
  const badges = type === "digital"
    ? ["Verified Reviews", "Secure Checkout", "Instant Digital Download", "PDF / Audiobook Access", "Customer Approved", "Build Level Promise"]
    : ["Verified Reviews", "Secure Checkout", "Premium Quality", "Printify Fulfillment", "Tracking Available", "Trusted by Builders"];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {badges.map(badge => <span key={badge} className="badge badge-dark" style={{ borderColor: "rgba(255,102,0,0.35)" }}>{badge}</span>)}
    </div>
  );
}

export function ProductReviews({ summary }: { summary?: ReviewSummaryData }) {
  const reviews = summary?.reviews || [];
  if (reviews.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <ProductReviewSummary summary={summary} />
        <div style={{ marginTop: 10 }}><RatingBreakdown reviews={reviews} /></div>
      </div>
      {reviews.slice(0, 4).map(review => (
        <div key={review.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "rgba(255,255,255,0.025)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 7 }}>
            <strong>{review.customerName}</strong>
            <Stars value={review.rating} size={14} />
          </div>
          <p style={{ color: "var(--text2)", fontSize: "0.86rem", lineHeight: 1.6 }}>{review.reviewText}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "var(--text3)", fontSize: "0.72rem", marginTop: 8 }}>
            <span>{new Date(review.createdAt).toLocaleDateString()}</span>
            {review.verifiedPurchase && <span className="badge badge-dark">Verified Purchase</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecommendationStrip<T extends { id: number; name: string; imageUrl?: string; price: string; category?: string }>(
  { title, products, hrefBase, currentProductId }: { title: string; products: T[]; hrefBase: "/shop" | "/digital"; currentProductId?: number }
) {
  const recommendations = products.filter(product => product.id !== currentProductId).slice(0, 4);
  if (!recommendations.length) return null;
  const getHref = (product: T) => hrefBase === "/digital" ? `/digital/${product.id}` : hrefBase;
  const actionLabel = hrefBase === "/digital" ? "View Product" : "View Product";

  return (
    <div style={{ marginTop: 22 }}>
      <h3 style={{ fontSize: "0.95rem", marginBottom: 12 }}>{title}</h3>
      <div className="recommendation-grid">
        {recommendations.map(product => (
          <Link
            key={product.id}
            to={getHref(product)}
            className="recommendation-card"
            aria-label={`${actionLabel}: ${product.name}`}
          >
            <div className="recommendation-card__image">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl.startsWith("storage:") ? `/api/digital/thumbnail/${encodeURIComponent(product.imageUrl.slice("storage:".length))}` : product.imageUrl}
                  alt={product.name}
                />
              ) : (
                <span style={{ color: "var(--text3)", fontSize: "0.75rem" }}>No Image</span>
              )}
            </div>
            <div className="recommendation-card__body">
              {product.category && <span className="badge badge-dark" style={{ alignSelf: "flex-start" }}>{product.category}</span>}
              <p className="recommendation-card__title">{product.name}</p>
              <p className="recommendation-card__price">${Number.parseFloat(product.price).toFixed(2)}</p>
              <span className="recommendation-card__button">{actionLabel}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CommentItem({ comment }: { comment: BlogComment }) {
  return (
    <div style={{ border: "1px solid var(--border)", background: comment.adminReply ? "rgba(255,102,0,0.07)" : "rgba(255,255,255,0.025)", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <strong style={{ fontFamily: "var(--font-display)", letterSpacing: "0.04em" }}>{comment.adminReply ? "Build Level" : comment.name}</strong>
        <span style={{ color: "var(--text3)", fontSize: "0.75rem" }}>{new Date(comment.createdAt).toLocaleDateString()}</span>
      </div>
      <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>{comment.comment}</p>
      {comment.replies?.length ? (
        <div style={{ display: "grid", gap: 10, marginTop: 12, paddingLeft: 12, borderLeft: "2px solid rgba(255,102,0,0.45)" }}>
          {comment.replies.map(reply => <CommentItem key={reply.id} comment={reply} />)}
        </div>
      ) : null}
    </div>
  );
}

export function BlogEngagement({ postId }: { postId: number }) {
  const [sessionId, setSessionId] = useState("");
  const [data, setData] = useState<BlogEngagementData | null>(null);
  const [form, setForm] = useState({ name: "", email: "", comment: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = (sid: string) => publicApi.getBlogEngagement(postId, sid).then(setData).catch(() => undefined);

  useEffect(() => {
    const sid = getEngagementSessionId();
    setSessionId(sid);
    load(sid);
  }, [postId]);

  const like = async () => {
    if (!sessionId) return;
    setData(await publicApi.likeBlogPost(postId, sessionId));
  };

  const rate = async (rating: number) => {
    if (!sessionId) return;
    const next = await publicApi.rateBlogPost(postId, rating, sessionId);
    setData(next);
    setMessage(next.message || "Thank you for your feedback");
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await publicApi.submitBlogComment(postId, { ...form, sessionId, parentId: null });
      setMessage("Thank you! Your comment has been submitted.");
      setForm({ name: "", email: "", comment: "" });
      await load(sessionId);
    } catch (error: any) {
      setMessage(error?.response?.data?.error || "Comment could not be submitted");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginTop: 56, borderTop: "1px solid var(--border)", paddingTop: 32 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
        <button type="button" onClick={like} className="btn btn-outline btn-sm" style={{ color: data?.liked ? "#ff6600" : undefined }}>
          ❤️ {data?.likes ?? 0} Likes
        </button>
        <span className="badge badge-dark">💬 {data?.comments ?? 0} Comments</span>
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center", color: "var(--text2)" }}>
          <Stars value={data?.ratingAverage || 0} /> {data?.ratingAverage?.toFixed?.(1) || "0.0"} ({data?.ratingCount || 0})
        </span>
      </div>

      <div style={{ marginBottom: 24 }}>
        <p style={{ color: "var(--text2)", marginBottom: 8 }}>Rate this article</p>
        <Stars value={data?.userRating || 0} onSelect={rate} size={24} />
      </div>

      <form onSubmit={submitComment} style={{ display: "grid", gap: 12, marginBottom: 28 }}>
        <h3 style={{ fontSize: "1rem" }}>Join the discussion</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <input className="input" required placeholder="Name" value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} />
          <input className="input" required type="email" placeholder="Email" value={form.email} onChange={e => setForm(current => ({ ...current, email: e.target.value }))} />
        </div>
        <textarea className="input" required rows={4} placeholder="Comment" value={form.comment} onChange={e => setForm(current => ({ ...current, comment: e.target.value }))} />
        <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>{loading ? "Submitting..." : "Submit Comment"}</button>
        {message && <p style={{ color: message.includes("could not") ? "var(--red)" : "#ff6600", fontSize: "0.85rem" }}>{message}</p>}
      </form>

      <div style={{ display: "grid", gap: 12 }}>
        {(data?.commentTree || []).map(comment => <CommentItem key={comment.id} comment={comment} />)}
      </div>
    </section>
  );
}
