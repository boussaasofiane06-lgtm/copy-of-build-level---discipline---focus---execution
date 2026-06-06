import { FormEvent, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { publicApi, SupportMessage, SupportTicket as Ticket } from "../lib/api";

export default function SupportTicketPage() {
  const { ticketNumber = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  const load = () => publicApi.getSupportTicket(ticketNumber, token).then(data => { setTicket(data.ticket); setMessages(data.messages); }).catch(err => setError(err?.response?.data?.error || "Ticket not found."));
  useEffect(() => { load(); }, [ticketNumber, token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await publicApi.replySupportTicket(ticketNumber, { token, message: reply });
    setReply("");
    load();
  };

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "56px 0 36px" }}>
        <div className="container">
          <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", letterSpacing: "0.16em", textTransform: "uppercase", fontSize: "0.75rem", marginBottom: 10 }}>Build Level Support</p>
          <h1>Support Ticket</h1>
        </div>
      </div>
      <div className="container section-sm" style={{ maxWidth: 860 }}>
        {error ? <div className="card" style={{ padding: 24 }}><p style={{ color: "var(--red)", marginBottom: 16 }}>{error}</p><Link to="/contact" className="btn btn-primary">Contact Support</Link></div> : ticket && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: "1.25rem" }}>{ticket.subject}</h2>
                <p style={{ color: "var(--text2)" }}>{ticket.ticketNumber} • {ticket.category}</p>
              </div>
              <span className="badge badge-red">{ticket.publicStatus}</span>
            </div>
            <div style={{ display: "grid", gap: 12, marginBottom: 22 }}>
              {messages.map(message => (
                <div key={message.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: message.senderType === "admin" ? "rgba(255,102,0,0.06)" : "rgba(255,255,255,0.025)" }}>
                  <strong>{message.senderType === "admin" ? "Build Level Support" : ticket.customerName}</strong>
                  <p style={{ color: "var(--text2)", whiteSpace: "pre-wrap", marginTop: 6 }}>{message.message}</p>
                  <p style={{ color: "var(--text3)", fontSize: "0.75rem", marginTop: 8 }}>{new Date(message.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
              <textarea className="input" required rows={4} placeholder="Reply to support" value={reply} onChange={e => setReply(e.target.value)} />
              <button className="btn btn-primary" type="submit">Send Reply</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
