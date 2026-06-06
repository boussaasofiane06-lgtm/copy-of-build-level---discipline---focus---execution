import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { publicApi } from "../lib/api";

const categories = [
  "Order not received", "Order tracking", "Damaged apparel", "Wrong apparel item", "Wrong size or color received",
  "Digital download missing", "Download link not working", "Payment or checkout problem", "Refund or return question",
  "Website technical problem", "Account problem", "Product question", "Subscription or email problem", "Review or comment problem", "Other",
];
const orderRelated = new Set(["Order not received", "Order tracking", "Damaged apparel", "Wrong apparel item", "Wrong size or color received"]);
const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type SupportContextValue = { openSupport: (prefill?: Partial<FormState>) => void; closeSupport: () => void; isSupportOpen: boolean };
const SupportContext = createContext<SupportContextValue | null>(null);

type FormState = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderNumber: string;
  productName: string;
  category: string;
  subject: string;
  description: string;
  preferredReplyMethod: string;
  consentToContact: boolean;
};

const initialForm: FormState = {
  customerName: "", customerEmail: "", customerPhone: "", orderNumber: "", productName: "", category: "Website technical problem", subject: "", description: "", preferredReplyMethod: "email", consentToContact: false,
};

const readFile = (file: File) => new Promise<{ fileName: string; mimeType: string; sizeBytes: number; dataUrl: string }>((resolve, reject) => {
  if (!allowedTypes.includes(file.type)) { reject(new Error("Unsupported file type.")); return; }
  if (file.size > 5 * 1024 * 1024) { reject(new Error("File must be 5MB or smaller.")); return; }
  const reader = new FileReader();
  reader.onload = () => resolve({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, dataUrl: String(reader.result || "") });
  reader.onerror = () => reject(new Error("Could not read file."));
  reader.readAsDataURL(file);
});

export function SupportProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [attachments, setAttachments] = useState<Array<{ fileName: string; mimeType: string; sizeBytes: number; dataUrl: string }>>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ ticketNumber: string; ticketUrl: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const openSupport = (prefill: Partial<FormState> = {}) => {
    setForm(current => ({ ...current, ...prefill }));
    setError("");
    setSuccess(null);
    setIsOpen(true);
  };
  const closeSupport = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeSupport(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); };
  }, [isOpen]);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setError("");
    try {
      const next = await Promise.all(Array.from(files).slice(0, 3 - attachments.length).map(readFile));
      setAttachments(current => [...current, ...next].slice(0, 3));
    } catch (fileError: any) {
      setError(fileError.message || "File upload failed.");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (orderRelated.has(form.category) && !form.orderNumber.trim()) { setError("Please include your order number for this issue."); return; }
    if (!form.consentToContact) { setError("Please confirm that support may contact you about this issue."); return; }
    setSubmitting(true);
    try {
      const technicalInfo = form.category === "Website technical problem" ? {
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        dateTime: new Date().toISOString(),
        guestStatus: "guest",
      } : {};
      const result = await publicApi.createSupportTicket({ ...form, technicalInfo, attachments });
      setSuccess({ ticketNumber: result.ticketNumber, ticketUrl: result.ticketUrl });
      setAttachments([]);
    } catch (submitError: any) {
      setError(submitError?.response?.data?.error || "We couldn't submit your support request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SupportContext.Provider value={{ openSupport, closeSupport, isSupportOpen: isOpen }}>
      {children}
      {isOpen && (
        <div className="support-modal" role="dialog" aria-modal="true" aria-labelledby="support-modal-title">
          <button className="support-modal__backdrop" aria-label="Close support form" onClick={closeSupport} />
          <div className="support-modal__panel">
            <button ref={closeRef} className="support-modal__close" onClick={closeSupport} aria-label="Close support form">×</button>
            {success ? (
              <div className="support-success">
                <p className="subscription-kicker">Build Level Support</p>
                <h2>Your request has been received.</h2>
                <p>Support ticket: <strong>{success.ticketNumber}</strong></p>
                <p>We'll send updates to the email address you provided.</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link to={success.ticketUrl.replace(window.location.origin, "")} className="btn btn-primary" onClick={closeSupport}>View Ticket</Link>
                  <button className="btn btn-outline" onClick={closeSupport}>Continue</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="support-form">
                <p className="subscription-kicker">Discipline • Focus • Execution</p>
                <h2 id="support-modal-title">REPORT A PROBLEM</h2>
                <p style={{ color: "var(--text2)" }}>Never include passwords or complete payment-card information.</p>
                <div className="support-form__grid">
                  <input className="input" required placeholder="Full name" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
                  <input className="input" required type="email" placeholder="Email address" value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />
                  <input className="input" placeholder="Phone (optional)" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
                  <input className="input" placeholder="Order number" value={form.orderNumber} onChange={e => setForm(f => ({ ...f, orderNumber: e.target.value }))} />
                  <input className="input" placeholder="Product name (optional)" value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} />
                  <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{categories.map(category => <option key={category}>{category}</option>)}</select>
                </div>
                <input className="input" required placeholder="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
                <textarea className="input" required rows={5} placeholder="Detailed description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                <select className="input" value={form.preferredReplyMethod} onChange={e => setForm(f => ({ ...f, preferredReplyMethod: e.target.value }))}><option value="email">Email</option><option value="phone">Phone</option></select>
                <input className="input" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple onChange={e => addFiles(e.target.files)} />
                {attachments.length > 0 && <p style={{ color: "var(--text3)", fontSize: "0.8rem" }}>{attachments.length} file(s) attached.</p>}
                <label style={{ display: "flex", gap: 9, color: "var(--text2)", alignItems: "flex-start" }}><input type="checkbox" checked={form.consentToContact} onChange={e => setForm(f => ({ ...f, consentToContact: e.target.checked }))} /> I agree that Build Level support may contact me about this issue.</label>
                {error && <p className="subscription-error">{error}</p>}
                <button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? "Submitting..." : "Submit Support Request"}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </SupportContext.Provider>
  );
}

export function useSupport() {
  const value = useContext(SupportContext);
  if (!value) throw new Error("useSupport must be used inside SupportProvider");
  return value;
}
