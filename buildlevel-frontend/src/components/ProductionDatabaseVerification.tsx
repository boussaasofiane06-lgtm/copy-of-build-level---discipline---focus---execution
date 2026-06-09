import { useState } from "react";
import { adminApi } from "../lib/api";

type VerificationReport = Awaited<ReturnType<typeof adminApi.verifyProductionDatabase>>;

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(26,26,26,0.96), rgba(10,10,10,0.96))",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 24,
  marginTop: 18,
};

function VerificationRows({ title, rows }: { title: string; rows: Array<Record<string, any>> }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
      <h4 style={{ fontSize: "0.86rem", marginBottom: 8 }}>{title}</h4>
      {rows.map((row, index) => (
        <div
          key={`${title}-${index}`}
          style={{
            display: "grid",
            gap: 4,
            borderTop: index ? "1px solid var(--border)" : "none",
            paddingTop: index ? 8 : 0,
            marginTop: index ? 8 : 0,
            color: "var(--text2)",
            fontSize: "0.78rem",
          }}
        >
          <strong style={{ color: row.status === "PASS" ? "#86efac" : "var(--red)" }}>
            {row.status} - {row.name || (row.column ? `${row.table}.${row.column}` : row.table)}
          </strong>
          {"exists" in row && <span>Exists: {row.exists ? "Yes" : "No"}</span>}
          {"duplicateCount" in row && <span>Duplicate count: {row.duplicateCount}</span>}
          <span>Safe recommended action: {row.safeRecommendedAction}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProductionDatabaseVerification({ showToast }: { showToast: (message: string, type?: "success" | "error") => void }) {
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [loading, setLoading] = useState(false);

  const runVerification = async () => {
    setLoading(true);
    try {
      const result = await adminApi.verifyProductionDatabase();
      setReport(result);
      showToast(`Database verification ${result.overallStatus}`);
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Database verification failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={panelStyle}>
      <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>
        Read-only audit
      </div>
      <h3 style={{ fontSize: "1.05rem", marginBottom: 8 }}>Verify Production Database</h3>
      <p style={{ color: "var(--text2)", fontSize: "0.86rem", marginBottom: 14 }}>
        Admin-protected read-only verification against the live backend database connection. No credentials, secrets, customer data, addresses, or order contents are returned.
      </p>
      <button className="btn btn-outline btn-sm" onClick={runVerification} disabled={loading}>
        {loading ? "Verifying..." : "VERIFY PRODUCTION DATABASE"}
      </button>

      {report && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <strong style={{ color: report.overallStatus === "PASS" ? "#86efac" : "var(--red)" }}>
            Overall: {report.overallStatus} - {new Date(report.checkedAt).toLocaleString()}
          </strong>
          <VerificationRows title="Required Tables" rows={report.tables} />
          <VerificationRows title="Required Unique Constraints" rows={report.constraints} />
          <VerificationRows title="Required Columns" rows={report.columns} />
        </div>
      )}
    </section>
  );
}
