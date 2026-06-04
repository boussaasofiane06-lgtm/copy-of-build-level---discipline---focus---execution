import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { publicApi } from "../lib/api";

type AccessState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      productName: string;
      email: string;
      downloadUrl: string;
      fileName?: string | null;
      downloadLimit: number;
      remainingDownloads: number;
      expiresAt: string;
    };

export default function DigitalSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id") || "";
  const [access, setAccess] = useState<AccessState>({ status: "loading" });

  useEffect(() => {
    if (!sessionId) {
      setAccess({ status: "error", message: "Missing Stripe checkout session. Please contact support with your payment receipt." });
      return;
    }

    let cancelled = false;
    publicApi.getDigitalPurchaseAccess(sessionId)
      .then(result => {
        if (cancelled) return;
        setAccess({
          status: "ready",
          productName: result.productName,
          email: result.email,
          downloadUrl: result.downloadUrl,
          fileName: result.fileName,
          downloadLimit: result.downloadLimit,
          remainingDownloads: result.remainingDownloads,
          expiresAt: result.expiresAt,
        });
      })
      .catch(error => {
        if (cancelled) return;
        setAccess({
          status: "error",
          message: error?.response?.data?.error || "Payment succeeded, but access is still being prepared. Please refresh or contact support.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "56px 0 36px" }}>
        <div className="container">
          <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.75rem", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>
            Payment Complete
          </p>
          <h1 style={{ marginBottom: 8 }}>Your Digital Product Is Ready</h1>
          <p style={{ color: "var(--text2)" }}>Secure access is tied to your Stripe checkout session.</p>
        </div>
      </div>

      <div className="container section-sm" style={{ maxWidth: 760 }}>
        <div className="card" style={{ padding: 28 }}>
          {access.status === "loading" && (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="spinner" />
              <p style={{ color: "var(--text2)" }}>Verifying payment and preparing your download...</p>
            </div>
          )}

          {access.status === "error" && (
            <div>
              <h2 style={{ fontSize: "1.1rem", marginBottom: 10 }}>Access needs attention</h2>
              <p style={{ color: "var(--text2)", lineHeight: 1.7, marginBottom: 18 }}>{access.message}</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={() => window.location.reload()} className="btn btn-primary btn-sm">Refresh Access</button>
                <Link to="/contact" className="btn btn-outline btn-sm">Contact Support</Link>
              </div>
            </div>
          )}

          {access.status === "ready" && (
            <div>
              <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>{access.productName}</h2>
              <p style={{ color: "var(--text2)", marginBottom: 18 }}>Access granted for {access.email}.</p>
              <a href={access.downloadUrl} download className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginBottom: 12 }}>
                Download {access.fileName || "Digital Product"}
              </a>
              <p style={{ color: "var(--text3)", fontSize: "0.78rem", lineHeight: 1.6 }}>
                {access.remainingDownloads} of {access.downloadLimit} downloads remaining. Access expires {new Date(access.expiresAt).toLocaleDateString()}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
