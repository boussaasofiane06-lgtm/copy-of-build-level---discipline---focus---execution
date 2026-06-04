import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { publicApi, BlogComment, BlogEngagement as BlogEngagementData } from "../lib/api";

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
      const result = await publicApi.submitBlogComment(postId, { ...form, sessionId, parentId: null });
      setMessage(result.message);
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
        <p style={{ color: "var(--text3)", fontSize: "0.78rem" }}>Comments go live after admin approval.</p>
      </form>

      <div style={{ display: "grid", gap: 12 }}>
        {(data?.commentTree || []).map(comment => <CommentItem key={comment.id} comment={comment} />)}
      </div>
    </section>
  );
}
