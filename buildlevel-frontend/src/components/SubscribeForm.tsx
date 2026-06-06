import { useSubscription } from "../context/SubscriptionContext";

export const SUBSCRIPTION_INTERESTS = [
  { value: "new_apparel", label: "New Apparel" },
  { value: "digital_products", label: "Digital Products" },
  { value: "audiobooks", label: "Audiobooks" },
  { value: "featured_products", label: "Featured Products" },
  { value: "blog_motivation", label: "Blog and Motivation" },
  { value: "build_level_news", label: "Build Level News" },
  { value: "all_updates", label: "All Updates" },
];

export default function SubscribeForm({ source = "website", compact = false }: { source?: string; compact?: boolean }) {
  const { openSubscription } = useSubscription();

  return (
    <section className={`subscribe-compact ${compact ? "subscribe-compact--small" : ""}`}>
      <div>
        <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", letterSpacing: "0.16em", textTransform: "uppercase", fontSize: "0.72rem", marginBottom: 8 }}>
          Get the Monthly Build
        </p>
        <h3 style={{ fontSize: compact ? "1rem" : "1.35rem", marginBottom: 8 }}>GET THE MONTHLY BUILD</h3>
        <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: compact ? "0.85rem" : "0.95rem" }}>
          One focused monthly update featuring selected products, digital resources, blog highlights, and Build Level news.
        </p>
        <p style={{ color: "var(--text3)", fontSize: "0.8rem", marginTop: 8 }}>No daily emails. Unsubscribe or manage your preferences anytime.</p>
      </div>
      <button type="button" onClick={() => openSubscription(source)} className="btn btn-primary">
        JOIN BUILD LEVEL
      </button>
    </section>
  );
}
