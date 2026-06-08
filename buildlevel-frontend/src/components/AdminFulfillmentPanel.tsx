import { useEffect, useState } from "react";
import { adminApi, FulfillmentOrder, FulfillmentOrderItem } from "../lib/api";

const panelStyle = {
  background: "linear-gradient(145deg, rgba(26,26,26,0.96), rgba(10,10,10,0.96))",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

export default function AdminFulfillmentPanel({ showToast }: { showToast: (message: string) => void }) {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [selected, setSelected] = useState<{ order: FulfillmentOrder; items: FulfillmentOrderItem[]; attempts: unknown[]; events: unknown[] } | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({ customerName: "", customerPhone: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "" });

  const address = selected?.order.shippingAddress as any;
  const missingFields = selected ? [
    !selected.order.customerName ? "Customer name" : "",
    !selected.order.customerEmail ? "Customer email" : "",
    !selected.order.customerPhone ? "Phone" : "",
    !address?.line1 ? "Address line 1" : "",
    !address?.city ? "City" : "",
    !address?.postal_code ? "ZIP / postal code" : "",
    !address?.country ? "Country" : "",
  ].filter(Boolean) : [];

  const load = async () => {
    setLoading(true);
    try {
      setOrders(await adminApi.getFulfillmentOrders(status));
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Error loading fulfillment orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [status]);

  const open = async (id: number) => {
    const next = await adminApi.getFulfillmentOrder(id);
    setSelected(next);
    const shipping = next.order.shippingAddress as any;
    setCustomerForm({
      customerName: next.order.customerName || shipping?.displayName || shipping?.name || "",
      customerPhone: next.order.customerPhone || shipping?.phone || "",
      line1: shipping?.line1 || "",
      line2: shipping?.line2 || "",
      city: shipping?.city || "",
      state: shipping?.state || "",
      postalCode: shipping?.postal_code || "",
      country: shipping?.country || "",
    });
    setEditingCustomer(false);
  };

  const action = async (label: string, run: () => Promise<unknown>) => {
    if (!confirm(`${label}? This affects fulfillment handling.`)) return;
    try {
      await run();
      showToast(`${label} complete`);
      await load();
      if (selected) await open(selected.order.id);
    } catch (error: any) {
      showToast(error?.response?.data?.error || `${label} failed`);
    }
  };

  const saveCustomerShipping = async () => {
    if (!selected) return;
    try {
      const result = await adminApi.updateFulfillmentCustomerShipping(selected.order.id, customerForm);
      showToast(result.missing.length ? `Saved. Missing: ${result.missing.join(", ")}` : "Customer/shipping info saved. Ready for Printify Test.");
      setEditingCustomer(false);
      await load();
      await open(selected.order.id);
    } catch (error: any) {
      showToast(error?.response?.data?.error || "Could not save customer/shipping info");
    }
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>Printify Fulfillment</div>
            <h3 style={{ fontSize: "1.15rem" }}>Orders & Safety Ledger</h3>
            <p style={{ color: "var(--text2)", fontSize: "0.86rem", marginTop: 6 }}>No automatic send-to-production controls are enabled here.</p>
          </div>
          <select className="input" style={{ maxWidth: 260 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["Paid", "Awaiting Fulfillment", "Ready for Printify Test", "Processing", "Printify Order Created", "Awaiting Production Approval", "Requires Admin Review", "Failed", "Cancelled", "Shipped", "Delivered"].map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 0.9fr) minmax(320px, 1.1fr)", gap: 18 }}>
        <div style={panelStyle}>
          <h4 style={{ marginBottom: 12 }}>Internal Orders ({orders.length})</h4>
          {loading ? <p style={{ color: "var(--text2)" }}>Loading...</p> : (
            <div style={{ display: "grid", gap: 10 }}>
              {orders.map(order => (
                <button key={order.id} type="button" onClick={() => open(order.id)} style={{ textAlign: "left", border: "1px solid var(--border)", background: selected?.order.id === order.id ? "rgba(255,102,0,0.08)" : "rgba(255,255,255,0.025)", color: "var(--text)", borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong>#{order.id} {order.customerEmail}</strong>
                    <span className="badge badge-dark">{order.fulfillmentStatus}</span>
                  </div>
                  <p style={{ color: "var(--text3)", fontSize: "0.76rem", marginTop: 4 }}>
                    Stripe: {order.stripePaymentStatus || "unknown"} · Printify: {order.printifyOrderId || "not created"} · Retries: {order.retryCount}
                  </p>
                  {order.errorMessage && <p style={{ color: "var(--red)", fontSize: "0.76rem", marginTop: 4 }}>{order.errorMessage}</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={panelStyle}>
          {!selected ? <p style={{ color: "var(--text2)" }}>Select an order to view details.</p> : (
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <h4>Order #{selected.order.id}</h4>
                <p style={{ color: "var(--text2)", marginTop: 4 }}>{selected.order.customerName || "Missing customer name"} · {selected.order.customerEmail}</p>
                <p style={{ color: "var(--text2)", fontSize: "0.82rem", marginTop: 4 }}>Phone: {selected.order.customerPhone || "Missing phone"}</p>
                <p style={{ color: "var(--text2)", fontSize: "0.82rem", marginTop: 4 }}>Website status: {selected.order.fulfillmentStatus} · Printify status: {selected.order.printifyStatus || "not synced"}</p>
                <p style={{ color: "var(--text3)", fontSize: "0.8rem" }}>Created {new Date(selected.order.createdAt).toLocaleString()}</p>
              </div>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <h5>Customer / Shipping Info</h5>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditingCustomer(current => !current)}>{editingCustomer ? "Cancel Edit" : "Edit Customer / Shipping Info"}</button>
                </div>
                {missingFields.length > 0 && <p style={{ color: "var(--red)", fontSize: "0.8rem", marginBottom: 8 }}>Missing: {missingFields.join(", ")}</p>}
                {!editingCustomer ? (
                  <div style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.7 }}>
                    <div>Name: {selected.order.customerName || "Missing"}</div>
                    <div>Email: {selected.order.customerEmail || "Missing"}</div>
                    <div>Phone: {selected.order.customerPhone || "Missing"}</div>
                    <div>Address: {address?.line1 || "Missing"}{address?.line2 ? `, ${address.line2}` : ""}</div>
                    <div>{address?.city || "Missing city"}, {address?.state || ""} {address?.postal_code || "Missing ZIP"}</div>
                    <div>Country: {address?.country || "Missing"}</div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    {[
                      ["customerName", "Customer name"],
                      ["customerPhone", "Phone"],
                      ["line1", "Address line 1"],
                      ["line2", "Address line 2"],
                      ["city", "City"],
                      ["state", "State"],
                      ["postalCode", "ZIP"],
                      ["country", "Country"],
                    ].map(([key, label]) => (
                      <label key={key} style={{ display: "grid", gap: 4, color: "var(--text2)", fontSize: "0.75rem" }}>
                        {label}
                        <input className="input" value={(customerForm as any)[key]} onChange={event => setCustomerForm(form => ({ ...form, [key]: event.target.value }))} />
                      </label>
                    ))}
                    <button className="btn btn-primary btn-sm" style={{ gridColumn: "1/-1" }} onClick={saveCustomerShipping}>Save Customer / Shipping Info</button>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-outline btn-sm" onClick={() => action("Hold order", () => adminApi.holdFulfillmentOrder(selected.order.id))}>Hold</button>
                <button className="btn btn-outline btn-sm" onClick={() => action("Release order", () => adminApi.releaseFulfillmentOrder(selected.order.id))}>Release</button>
                <button className="btn btn-outline btn-sm" onClick={() => action("Refresh status", () => adminApi.refreshFulfillmentOrder(selected.order.id))}>Refresh</button>
                <button className="btn btn-outline btn-sm" onClick={() => action("Retry Printify creation", () => adminApi.retryFulfillmentOrder(selected.order.id))}>Retry</button>
                <button className="btn btn-outline btn-sm" onClick={() => action("Mark issue resolved", () => adminApi.resolveFulfillmentOrder(selected.order.id))}>Resolve</button>
              </div>
              <div>
                <h5 style={{ marginBottom: 8 }}>Items</h5>
                <div style={{ display: "grid", gap: 8 }}>
                  {selected.items.map(item => (
                    <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                      <strong>{item.productName}</strong>
                      <p style={{ color: "var(--text2)", fontSize: "0.82rem" }}>Qty {item.quantity} · {item.selectedSize || "No option"} · ${item.unitPrice || "0.00"}</p>
                      <p style={{ color: "var(--text3)", fontSize: "0.76rem" }}>Printify product {item.printifyProductId || "missing"} · variant {item.printifyVariantId || "missing"}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h5 style={{ marginBottom: 8 }}>Printify / Errors</h5>
                <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", color: "var(--text2)", background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: "0.75rem" }}>
                  {JSON.stringify({ printifyOrderId: selected.order.printifyOrderId, printifyStatus: selected.order.printifyStatus, error: selected.order.errorMessage }, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
