import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { adminApi, BlogComment, Review } from "../lib/api";
import { Stars } from "./Engagement";

const panelStyle = {
  background: "linear-gradient(145deg, rgba(26,26,26,0.96), rgba(10,10,10,0.96))",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  background: "var(--bg3)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  fontSize: "0.85rem",
};

export default function AdminModerationPanel({ showToast }: { showToast: (message: string) => void }) {
  const [status, setStatus] = useState("");
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [settings, setSettings] = useState({ bannedWords: "" });
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [reviewForm, setReviewForm] = useState({ customerName: "", email: "", rating: 5, reviewText: "", targetType: "site" as "site" | "product" | "digital", targetId: "", featured: true, verifiedPurchase: true });

  const load = async () => {
    const [queue, analyticsData, settingsData] = await Promise.all([
      adminApi.getModerationQueue(status),
      adminApi.getEngagementAnalytics(),
      adminApi.getEngagementSettings(),
    ]);
    setComments(queue.comments);
    setReviews(queue.reviews);
    setAnalytics(analyticsData);
    setSettings({ bannedWords: settingsData.bannedWords });
  };

  useEffect(() => { load().catch(() => showToast("Error loading moderation")); }, [status]);

  const updateComment = async (id: number, nextStatus: string) => {
    await adminApi.updateCommentModeration(id, { status: nextStatus });
    showToast(`Comment ${nextStatus}`);
    load();
  };

  const updateReview = async (id: number, nextStatus: string, featured?: boolean) => {
    await adminApi.updateReviewModeration(id, { status: nextStatus, featured });
    showToast(`Review ${nextStatus}`);
    load();
  };

  const reply = async (id: number) => {
    const text = replyText[id]?.trim();
    if (!text) return;
    await adminApi.replyToComment(id, text);
    setReplyText(current => ({ ...current, [id]: "" }));
    showToast("Reply posted");
    load();
  };

  const addReview = async (event: FormEvent) => {
    event.preventDefault();
    await adminApi.createAdminReview({
      ...reviewForm,
      targetId: reviewForm.targetId ? Number(reviewForm.targetId) : null,
      rating: Number(reviewForm.rating),
      status: "approved",
    } as any);
    setReviewForm({ customerName: "", email: "", rating: 5, reviewText: "", targetType: "site", targetId: "", featured: true, verifiedPurchase: true });
    showToast("Review added");
    load();
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>Community Control</div>
            <h3 style={{ fontSize: "1.15rem" }}>Moderation & Engagement Analytics</h3>
          </div>
          <select style={{ ...inputStyle, maxWidth: 220 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {["pending", "approved", "rejected", "hidden", "spam", "blocked"].map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        {analytics && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {Object.entries(analytics.totals || {}).map(([key, value]) => (
              <div key={key} style={{ background: "rgba(255,255,255,0.035)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ color: "var(--text3)", fontSize: "0.75rem", textTransform: "uppercase" }}>{key}</div>
                <strong style={{ fontSize: "1.35rem" }}>{String(value)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
        <div style={panelStyle}>
          <h4 style={{ marginBottom: 12 }}>Comments ({comments.length})</h4>
          <div style={{ display: "grid", gap: 12 }}>
            {comments.map(comment => (
              <div key={comment.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <strong>{comment.name}</strong>
                  <span className="badge badge-dark">{comment.status}</span>
                </div>
                <p style={{ color: "var(--text2)", marginBottom: 10 }}>{comment.comment}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {["approved", "rejected", "hidden", "spam", "blocked"].map(next => <button key={next} className="btn btn-outline btn-sm" onClick={() => updateComment(comment.id, next)}>{next}</button>)}
                  <button className="btn btn-outline btn-sm" onClick={() => adminApi.deleteComment(comment.id).then(() => load())}>Delete</button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={inputStyle} placeholder="Admin reply" value={replyText[comment.id] || ""} onChange={e => setReplyText(current => ({ ...current, [comment.id]: e.target.value }))} />
                  <button className="btn btn-primary btn-sm" onClick={() => reply(comment.id)}>Reply</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={panelStyle}>
          <h4 style={{ marginBottom: 12 }}>Reviews ({reviews.length})</h4>
          <div style={{ display: "grid", gap: 12 }}>
            {reviews.map(review => (
              <div key={review.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <strong>{review.customerName}</strong>
                  <span className="badge badge-dark">{review.status}</span>
                </div>
                <Stars value={review.rating} />
                <p style={{ color: "var(--text2)", margin: "8px 0 10px" }}>{review.reviewText}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["approved", "rejected", "hidden", "spam", "blocked"].map(next => <button key={next} className="btn btn-outline btn-sm" onClick={() => updateReview(review.id, next, review.featured)}>{next}</button>)}
                  <button className="btn btn-outline btn-sm" onClick={() => updateReview(review.id, review.status, !review.featured)}>{review.featured ? "Unfeature" : "Feature"}</button>
                  <button className="btn btn-outline btn-sm" onClick={() => adminApi.deleteReview(review.id).then(() => load())}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={panelStyle}>
        <h4 style={{ marginBottom: 12 }}>Add Review / Testimonial</h4>
        <form onSubmit={addReview} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <input style={inputStyle} required placeholder="Customer name" value={reviewForm.customerName} onChange={e => setReviewForm(f => ({ ...f, customerName: e.target.value }))} />
          <input style={inputStyle} placeholder="Email" value={reviewForm.email} onChange={e => setReviewForm(f => ({ ...f, email: e.target.value }))} />
          <input style={inputStyle} type="number" min={1} max={5} value={reviewForm.rating} onChange={e => setReviewForm(f => ({ ...f, rating: Number(e.target.value) }))} />
          <select style={inputStyle} value={reviewForm.targetType} onChange={e => setReviewForm(f => ({ ...f, targetType: e.target.value as any }))}>
            <option value="site">Site</option>
            <option value="product">Apparel Product</option>
            <option value="digital">Digital Product</option>
          </select>
          <input style={inputStyle} placeholder="Product ID optional" value={reviewForm.targetId} onChange={e => setReviewForm(f => ({ ...f, targetId: e.target.value }))} />
          <textarea style={{ ...inputStyle, gridColumn: "1/-1" }} required rows={3} placeholder="Review" value={reviewForm.reviewText} onChange={e => setReviewForm(f => ({ ...f, reviewText: e.target.value }))} />
          <label style={{ color: "var(--text2)" }}><input type="checkbox" checked={reviewForm.featured} onChange={e => setReviewForm(f => ({ ...f, featured: e.target.checked }))} /> Featured</label>
          <label style={{ color: "var(--text2)" }}><input type="checkbox" checked={reviewForm.verifiedPurchase} onChange={e => setReviewForm(f => ({ ...f, verifiedPurchase: e.target.checked }))} /> Verified Purchase</label>
          <button className="btn btn-primary btn-sm" type="submit">Add Review</button>
        </form>
      </div>

      <div style={panelStyle}>
        <h4 style={{ marginBottom: 12 }}>Anti-Spam Settings</h4>
        <textarea style={{ ...inputStyle, minHeight: 110 }} value={settings.bannedWords} onChange={e => setSettings({ bannedWords: e.target.value })} />
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => adminApi.saveEngagementSettings(settings).then(() => showToast("Engagement settings saved"))}>Save Settings</button>
      </div>
    </div>
  );
}
