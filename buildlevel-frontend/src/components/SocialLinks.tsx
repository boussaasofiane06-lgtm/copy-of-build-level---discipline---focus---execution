import { useEffect, useState } from "react";
import { publicApi, PublicSocialLink } from "../lib/api";

const labels: Record<PublicSocialLink["platform"], string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  pinterest: "Pinterest",
};

export default function SocialLinks({ compact = false }: { compact?: boolean }) {
  const [links, setLinks] = useState<PublicSocialLink[]>([]);

  useEffect(() => {
    publicApi.getSocialLinks()
      .then(data => setLinks((data.links || []).filter(link => !!link.url)))
      .catch(() => setLinks([]));
  }, []);

  if (links.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: compact ? 8 : 10, flexWrap: "wrap", alignItems: "center" }}>
      {links.map(link => (
        <a
          key={link.platform}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open Build Level ${labels[link.platform]}`}
          title={labels[link.platform]}
          style={{
            width: compact ? 34 : 38,
            height: compact ? 34 : 38,
            borderRadius: "50%",
            border: "1px solid var(--border)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text)",
            background: "rgba(255,255,255,0.035)",
            fontFamily: "var(--font-display)",
            fontSize: compact ? "0.62rem" : "0.68rem",
            letterSpacing: "0.08em",
            boxShadow: "0 0 18px rgba(192,57,43,0.08)",
          }}
        >
          {labels[link.platform].slice(0, 2).toUpperCase()}
        </a>
      ))}
    </div>
  );
}
