import { useEffect } from "react";
import { publicApi } from "../lib/api";

export default function TidioWidget() {
  useEffect(() => {
    let script: HTMLScriptElement | null = null;
    let cancelled = false;

    publicApi.getTidioConfig()
      .then(config => {
        if (cancelled || !config.enabled || !config.publicKey) return;
        if (document.querySelector(`script[data-buildlevel-tidio="${config.publicKey}"]`)) return;
        script = document.createElement("script");
        script.src = `https://code.tidio.co/${config.publicKey}.js`;
        script.async = true;
        script.dataset.buildlevelTidio = config.publicKey;
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
