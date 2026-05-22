import { useEffect } from "react";
import { publicApi } from "../lib/api";

function normalizeTidioPublicKey(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  const match = trimmed.match(/code\.tidio\.co\/([^"'\s/]+)\.js/i);
  if (match?.[1]) return match[1];
  return trimmed.replace(/^https?:\/\/code\.tidio\.co\//i, "").replace(/\.js$/i, "");
}

export default function TidioWidget() {
  useEffect(() => {
    let script: HTMLScriptElement | null = null;
    let cancelled = false;

    publicApi.getTidioConfig()
      .then(config => {
        const publicKey = normalizeTidioPublicKey(config.publicKey);
        if (cancelled || !config.enabled || !publicKey) return;
        if (document.querySelector(`script[data-buildlevel-tidio="${publicKey}"]`)) return;
        script = document.createElement("script");
        script.src = `https://code.tidio.co/${publicKey}.js`;
        script.async = true;
        script.dataset.buildlevelTidio = publicKey;
        document.body.appendChild(script);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (script?.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  return null;
}
