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

function SocialIcon({ platform, size }: { platform: PublicSocialLink["platform"]; size: number }) {
  const commonProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
    focusable: false,
  };

  switch (platform) {
    case "instagram":
      return (
        <svg {...commonProps}>
          <path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm0 2A3.8 3.8 0 0 0 4 7.8v8.4A3.8 3.8 0 0 0 7.8 20h8.4a3.8 3.8 0 0 0 3.8-3.8V7.8A3.8 3.8 0 0 0 16.2 4H7.8Zm4.2 3.25A4.75 4.75 0 1 1 12 16.75a4.75 4.75 0 0 1 0-9.5Zm0 2A2.75 2.75 0 1 0 12 14.75a2.75 2.75 0 0 0 0-5.5Zm5.2-2.45a1.1 1.1 0 1 1-1.1 1.1 1.1 1.1 0 0 1 1.1-1.1Z" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...commonProps}>
          <path d="M14.1 8.1V6.65c0-.7.45-.86.77-.86h1.96V2.14L14.13 2C11.12 2 10.44 4.25 10.44 5.7v2.4H8v3.77h2.44V22h3.66V11.87h3.04l.4-3.77H14.1Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...commonProps}>
          <path d="M16.72 2c.34 2.35 1.66 3.75 3.94 3.9v3.32a7.35 7.35 0 0 1-3.9-1.17v6.62c0 4.55-2.5 7.33-6.43 7.33A6.16 6.16 0 0 1 4 15.82c0-3.54 2.7-6.22 6.2-6.22.45 0 .9.05 1.32.15v3.5a3.18 3.18 0 0 0-1.33-.29 2.75 2.75 0 1 0 2.74 2.75V2h3.8Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...commonProps}>
          <path d="M21.58 7.2a3.02 3.02 0 0 0-2.13-2.14C17.56 4.55 12 4.55 12 4.55s-5.56 0-7.45.51A3.02 3.02 0 0 0 2.42 7.2 31.52 31.52 0 0 0 1.9 12a31.52 31.52 0 0 0 .52 4.8 3.02 3.02 0 0 0 2.13 2.14c1.89.51 7.45.51 7.45.51s5.56 0 7.45-.51a3.02 3.02 0 0 0 2.13-2.14A31.52 31.52 0 0 0 22.1 12a31.52 31.52 0 0 0-.52-4.8ZM9.95 15.57V8.43L16.22 12l-6.27 3.57Z" />
        </svg>
      );
    case "x":
      return (
        <svg {...commonProps}>
          <path d="M14.22 10.16 22.53 0h-1.97l-7.21 8.82L7.59 0H.95l8.72 13.36L.95 24h1.97l7.62-9.31L16.62 24h6.64l-9.04-13.84Zm-2.7 3.3-.88-1.32L3.6 1.56h3.05l5.67 8.52.88 1.32 7.37 11.08h-3.05l-6-9.02Z" transform="scale(.92) translate(.8 .3)" />
        </svg>
      );
    case "pinterest":
      return (
        <svg {...commonProps}>
          <path d="M12.04 2C6.5 2 3.7 5.72 3.7 9.63c0 1.82 1.02 4.08 2.66 4.8.25.11.38.06.44-.18.05-.18.27-1.08.37-1.5a.4.4 0 0 0-.1-.38 4.52 4.52 0 0 1-.98-2.76c0-2.74 2.07-5.4 5.6-5.4 3.05 0 5.18 2.08 5.18 5.05 0 3.35-1.7 5.67-3.9 5.67-1.22 0-2.13-1-1.84-2.24.35-1.47 1.03-3.05 1.03-4.1 0-.95-.5-1.74-1.56-1.74-1.24 0-2.24 1.28-2.24 3 0 1.1.37 1.84.37 1.84l-1.5 6.36c-.44 1.86-.07 4.1-.04 4.34.02.14.19.18.27.07.11-.15 1.54-1.9 2.03-3.7.14-.52.8-3.13.8-3.13.4.76 1.55 1.4 2.78 1.4 3.66 0 6.3-3.36 6.3-7.54C19.45 5.52 16.13 2 12.04 2Z" />
        </svg>
      );
    default:
      return null;
  }
}

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
            boxShadow: "0 0 18px rgba(192,57,43,0.08)",
            transition: "color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = "var(--red)";
            e.currentTarget.style.borderColor = "rgba(192,57,43,0.7)";
            e.currentTarget.style.boxShadow = "0 0 22px rgba(192,57,43,0.24)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "var(--text)";
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "0 0 18px rgba(192,57,43,0.08)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <SocialIcon platform={link.platform} size={compact ? 17 : 19} />
        </a>
      ))}
    </div>
  );
}
