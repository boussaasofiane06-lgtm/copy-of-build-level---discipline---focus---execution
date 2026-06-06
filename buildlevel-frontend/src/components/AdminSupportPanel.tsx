import { useEffect, useState } from "react";
import { SupportTicket, adminApi } from "../lib/api";

const panelStyle: React.CSSProperties = { background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 };

export default function AdminSupportPanel({ showToast }: { showToast: (message: string, type?: "success" | "error") => void }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    try { setTickets(await adminApi.getSupportTickets({ status, search })); }
    catch (e: any) { showToast(e?.response?.data?.error || "Failed to load support tickets", "error"); }
  };
  useEffect(() => { load(); }, []);

  const open = async (id: number) => setSelected(await adminApi.getSupportTicket(id));
  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    await adminApi.replySupportTicket(selected.ticket.id, { message: reply, status: "waiting_customer", public: true });
    setReply(""); showToast("Reply sent"); open(selected.ticket.id); load();
  };
  const addNote = async () => {
    if (!selected || !note.trim()) return;
    await adminApi.addSupportNote(selected.ticket.id, note);
    setNote(""); showToast("Private note saved"); open(selected.ticket.id);
  };
  const update = async (data: any) => {
    if (!selected) return;
    await adminApi.updateSupportTicket(selected.ticket.id, data);
    showToast("Ticket updated"); open(selected.ticket.id); load();
  };
  const block = async () => {
    if (!selected || !window.confirm("Block this sender from support? Order/payment history will not be deleted.")) return;
    await adminApi.blockSupportUser({ blockType: "email", value: selected.ticket.customerEmail, reason: "Blocked from support dashboard" });
    showToast("Sender blocked"); load();
  };

  const stats = {
    new: tickets.filter(t => t.status === "new").length,
    open: tickets.filter(t => !["resolved", "closed", "spam", "blocked"].includes(t.status)).length,
    resolved: tickets.filter(t => t.status === "resolved").length,
    reopened: tickets.filter(t => t.status === "reopened").length,
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {Object.entries(stats).map(([label, value]) => <div key={label} style={panelStyle}><p style={{ color: "var(--text3)" }}>{label}</p><strong style={{ fontSize: "1.4rem" }}>{value}</strong></div>)}
      </div>
      <div style={panelStyle}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Customer Support</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Search ticket, email, order, product" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input" style={{ maxWidth: 220 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option><option value="new">New</option><option value="in_progress">In Progress</option><option value="waiting_customer">Waiting for Customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="reopened">Reopened</option><option value="spam">Spam</option><option value="blocked">Blocked</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={load}>Filter</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(320px, 1.1fr)", gap: 18 }}>
        <div style={panelStyle}>
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Tickets</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {tickets.map(ticket => (
              <button key={ticket.id} onClick={() => open(ticket.id)} style={{ textAlign: "left", border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: selected?.ticket?.id === ticket.id ? "rgba(255,102,0,0.08)" : "rgba(255,255,255,0.02)", color: "var(--text)" }}>
                <strong>{ticket.ticketNumber}</strong> <span className="badge badge-dark">{ticket.status}</span>
                <p>{ticket.subject}</p>
                <p style={{ color: "var(--text3)", fontSize: "0.78rem" }}>{ticket.customerEmail} • {ticket.category} • {ticket.priority}</p>
              </button>
            ))}
          </div>
        </div>
        <div style={panelStyle}>
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Ticket Details</h3>
          {selected ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div><strong>{selected.ticket.ticketNumber}</strong><p style={{ color: "var(--text2)" }}>{selected.ticket.customerName} • {selected.ticket.customerEmail}</p><p style={{ color: "var(--text3)" }}>{selected.ticket.orderNumber || "No order"} • {selected.ticket.productName || "No product"}</p></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select className="input" value={selected.ticket.status} onChange={e => update({ status: e.target.value })}><option value="new">New</option><option value="in_progress">In Progress</option><option value="waiting_customer">Waiting</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="reopened">Reopened</option><option value="spam">Spam</option></select>
                <select className="input" value={selected.ticket.priority} onChange={e => update({ priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {selected.messages.map((message: any) => <div key={message.id} style={{ border: "1px solid var(--border)", padding: 10, borderRadius: 8 }}><strong>{message.senderType}</strong><p style={{ whiteSpace: "pre-wrap", color: "var(--text2)" }}>{message.message}</p></div>)}
              </div>
              <textarea className="input" rows={4} placeholder="Reply to customer" value={reply} onChange={e => setReply(e.target.value)} />
              <button className="btn btn-primary" onClick={sendReply}>Reply to Customer</button>
              <textarea className="input" rows={3} placeholder="Private internal note" value={note} onChange={e => setNote(e.target.value)} />
              <button className="btn btn-outline" onClick={addNote}>Save Private Note</button>
              <button className="btn btn-outline" onClick={block}>Block Sender</button>
            </div>
          ) : <p style={{ color: "var(--text2)" }}>Select a ticket to review, reply, resolve, or add private notes.</p>}
        </div>
      </div>
    </div>
  );
}
