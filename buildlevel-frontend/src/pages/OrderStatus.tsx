import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { publicApi, PublicOrderStatus } from "../lib/api";
import ReportProblemButton from "../components/ReportProblemButton";

const issueTypes = ["Damaged product", "Manufacturing defect", "Wrong product received", "Missing item", "Lost shipment", "Delivery problem", "Wrong size or color ordered", "Other issue"];

export default function OrderStatusPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<PublicOrderStatus | null>(null);
  const [error, setError] = useState("");
  const [issue, setIssue] = useState({ issueType: issueTypes[0], description: "", evidenceUrl: "", preferredResolution: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    publicApi.getOrderStatus(token).then(setData).catch(err => setError(err?.response?.data?.error || "Order not found."));
  };

  useEffect(() => {
    if (token) load();
  }, [token]);

  const submitIssue = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await publicApi.reportOrderIssue(token, issue);
      setIssue({ issueType: issueTypes[0], description: "", evidenceUrl: "", preferredResolution: "" });
      await load();
      alert("Issue reported. Build Level support will review it.");
    } catch (err: any) {
      alert(err?.response?.data?.error || "Could not report issue.");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="container section-sm" style={{ maxWidth: 760, textAlign: "center" }}>
        <h1 style={{ marginBottom: 12 }}>Order Not Found</h1>
        <p style={{ color: "var(--text2)", marginBottom: 24 }}>{error}</p>
        <Link to="/contact" className="btn btn-primary">Contact Support</Link>
      </div>
    );
  }

  if (!data) return <div className="container section-sm" style={{ display: "flex", justifyContent: "center", padding: 80 }}><div className="spinner" /></div>;

  const shipping = data.order.shippingAddress || {};

  return (
    <div className="container section-sm" style={{ maxWidth: 980 }}>
      <div className="card" style={{ padding: 24, marginBottom: 18 }}>
        <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>Build Level Order Status</p>
        <h1 style={{ marginBottom: 8 }}>Order #{data.order.id}</h1>
        <p style={{ color: "var(--text2)" }}>Status: <strong>{data.order.customerStatus || "Order Received"}</strong></p>
        <p style={{ color: "var(--text3)", fontSize: "0.82rem", marginTop: 4 }}>Payment: {data.order.paymentStatus || "received"} • Last updated {new Date(data.order.lastUpdated).toLocaleString()}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 18 }}>
        <section className="card" style={{ padding: 18 }}>
          <h3 style={{ fontSize: "0.95rem", marginBottom: 10 }}>Items</h3>
          {data.items.map(item => (
            <div key={item.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
              <strong>{item.productName}</strong>
              <p style={{ color: "var(--text2)", fontSize: "0.84rem" }}>Qty {item.quantity} • {item.selectedSize || "Default option"}{item.selectedColor ? ` • ${item.selectedColor}` : ""}</p>
            </div>
          ))}
        </section>
        <section className="card" style={{ padding: 18 }}>
          <h3 style={{ fontSize: "0.95rem", marginBottom: 10 }}>Shipping Address</h3>
          <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>
            {String(shipping.line1 || "")}<br />
            {shipping.line2 ? <>{String(shipping.line2)}<br /></> : null}
            {String(shipping.city || "")}, {String(shipping.state || "")} {String(shipping.postal_code || "")}<br />
            {String(shipping.country || "")}
          </p>
        </section>
      </div>

      <section className="card" style={{ padding: 18, marginBottom: 18 }}>
        <h3 style={{ fontSize: "0.95rem", marginBottom: 10 }}>Shipments & Tracking</h3>
        {data.shipments.length === 0 ? <p style={{ color: "var(--text2)" }}>Tracking is not available yet.</p> : data.shipments.map(shipment => (
          <div key={shipment.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
            <strong>{shipment.carrier || "Carrier pending"}</strong>
            <p style={{ color: "var(--text2)" }}>{shipment.trackingNumber || "Tracking pending"} • {shipment.status || "Shipment update"}</p>
            {shipment.trackingUrl && <a className="btn btn-outline btn-sm" href={shipment.trackingUrl} target="_blank" rel="noreferrer">Track Package</a>}
          </div>
        ))}
      </section>

      <section className="card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: "0.95rem", marginBottom: 10 }}>Report a Problem</h3>
        <form onSubmit={submitIssue} style={{ display: "grid", gap: 10 }}>
          <select className="input" value={issue.issueType} onChange={event => setIssue(current => ({ ...current, issueType: event.target.value }))}>
            {issueTypes.map(type => <option key={type}>{type}</option>)}
          </select>
          <textarea className="input" rows={4} placeholder="Describe what happened" value={issue.description} onChange={event => setIssue(current => ({ ...current, description: event.target.value }))} required />
          <input className="input" placeholder="Photo/video evidence URL (optional)" value={issue.evidenceUrl} onChange={event => setIssue(current => ({ ...current, evidenceUrl: event.target.value }))} />
          <input className="input" placeholder="Preferred resolution (optional)" value={issue.preferredResolution} onChange={event => setIssue(current => ({ ...current, preferredResolution: event.target.value }))} />
          <button className="btn btn-primary" disabled={submitting}>{submitting ? "Submitting..." : "Report Issue"}</button>
        </form>
        <ReportProblemButton source={`Order ${data.order.id}`} style={{ width: "100%", marginTop: 12 }} />
      </section>
    </div>
  );
}
