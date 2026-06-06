import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { publicApi } from "../lib/api";
import { SUBSCRIPTION_INTERESTS } from "../components/SubscribeForm";

type SubscriptionContextValue = {
  openSubscription: (source?: string) => void;
  closeSubscription: () => void;
  isSubscriptionOpen: boolean;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

const INDIVIDUAL_INTERESTS = SUBSCRIPTION_INTERESTS.filter(interest => interest.value !== "all_updates").map(interest => interest.value);

function getFriendlyError(error: any) {
  const message = String(error?.response?.data?.error || "");
  if (/email/i.test(message)) return "Enter a valid email address.";
  if (/interest/i.test(message)) return "Choose at least one type of update.";
  if (/consent/i.test(message)) return "Please confirm that you agree to receive the monthly Build Level email.";
  if (/already|subscribed/i.test(message)) return "This email is already subscribed. You can update your preferences.";
  return "We couldn't complete your subscription right now. Please try again.";
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState("website");
  const [form, setForm] = useState({ email: "", firstName: "", interests: [] as string[], consent: false, resubscribe: false });
  const [state, setState] = useState<"form" | "success" | "existing" | "resubscribe">("form");
  const [message, setMessage] = useState("");
  const [manageUrl, setManageUrl] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const openSubscription = (nextSource = "website") => {
    setSource(nextSource);
    setIsOpen(true);
    setError("");
    setMessage("");
    setState("form");
  };

  const closeSubscription = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSubscription();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const toggleInterest = (value: string) => {
    setForm(current => {
      if (value === "all_updates") {
        const allSelected = current.interests.includes("all_updates");
        return { ...current, interests: allSelected ? [] : ["all_updates", ...INDIVIDUAL_INTERESTS] };
      }
      const exists = current.interests.includes(value);
      const next = exists ? current.interests.filter(item => item !== value && item !== "all_updates") : [...current.interests.filter(item => item !== "all_updates"), value];
      const allIndividualsSelected = INDIVIDUAL_INTERESTS.every(interest => next.includes(interest));
      return { ...current, interests: allIndividualsSelected ? ["all_updates", ...next] : next };
    });
  };

  const submit = async (event?: FormEvent, forceResubscribe = false) => {
    event?.preventDefault();
    setError("");
    setMessage("");
    if (!form.email.trim()) { setError("Enter a valid email address."); return; }
    if (form.interests.length === 0) { setError("Choose at least one type of update."); return; }
    if (!form.consent) { setError("Please confirm that you agree to receive the monthly Build Level email."); return; }
    setSending(true);
    try {
      const result = await publicApi.subscribe({ ...form, source, resubscribe: forceResubscribe || form.resubscribe });
      setManageUrl(result.manageUrl || "");
      setMessage(result.message || "You're in. Watch for your monthly Build Level update featuring selected products, resources, and brand news.");
      setState(result.status === "existing" ? "existing" : "success");
    } catch (submitError: any) {
      if (submitError?.response?.status === 409 && submitError?.response?.data?.status === "unsubscribed") {
        setManageUrl(submitError.response.data.manageUrl || "");
        setMessage("This email was previously unsubscribed. Confirm resubscription to receive one monthly Build Level email again.");
        setState("resubscribe");
      } else {
        setError(getFriendlyError(submitError));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <SubscriptionContext.Provider value={{ openSubscription, closeSubscription, isSubscriptionOpen: isOpen }}>
      {children}
      {isOpen && (
        <div className="subscription-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-modal-title">
          <button className="subscription-modal__backdrop" type="button" aria-label="Close subscription popup" onClick={closeSubscription} />
          <div className="subscription-modal__panel">
            <button ref={closeRef} type="button" onClick={closeSubscription} className="subscription-modal__close" aria-label="Close subscription popup">×</button>
            {state === "success" || state === "existing" ? (
              <div className="subscription-success">
                <p className="subscription-kicker">The Monthly Build</p>
                <h2>WELCOME TO BUILD LEVEL</h2>
                <p>{state === "existing" ? "Welcome back. This email is already part of Build Level." : "You're in. Watch for your monthly Build Level update featuring selected products, resources, and brand news."}</p>
                <p style={{ color: "var(--text3)", fontSize: "0.86rem" }}>One focused update each month. No daily emails.</p>
                <div className="subscription-modal__actions">
                  <button type="button" className="btn btn-primary" onClick={closeSubscription}>CONTINUE EXPLORING</button>
                  {manageUrl && <Link className="btn btn-outline" to={manageUrl} onClick={closeSubscription}>MANAGE PREFERENCES</Link>}
                </div>
              </div>
            ) : state === "resubscribe" ? (
              <div className="subscription-success">
                <p className="subscription-kicker">Confirm Resubscription</p>
                <h2>WELCOME BACK</h2>
                <p>{message}</p>
                {error && <p className="subscription-error">{error}</p>}
                <div className="subscription-modal__actions">
                  <button type="button" disabled={sending} className="btn btn-primary" onClick={() => submit(undefined, true)}>{sending ? "Confirming..." : "CONFIRM RESUBSCRIPTION"}</button>
                  {manageUrl && <Link className="btn btn-outline" to={manageUrl} onClick={closeSubscription}>MANAGE PREFERENCES</Link>}
                  <button type="button" className="btn btn-ghost" onClick={closeSubscription}>Close</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="subscription-modal__form">
                <p className="subscription-kicker">Discipline • Focus • Execution</p>
                <h2 id="subscription-modal-title">JOIN THE BUILD LEVEL COMMUNITY</h2>
                <p style={{ color: "var(--text2)", lineHeight: 1.65 }}>Choose what you want to receive and get one focused Build Level update each month.</p>
                <input className="input" type="text" placeholder="First name (optional)" value={form.firstName} onChange={event => setForm(current => ({ ...current, firstName: event.target.value }))} />
                <input className="input" required type="email" placeholder="Email address" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} />
                <div className="subscription-interest-grid">
                  {SUBSCRIPTION_INTERESTS.map(interest => (
                    <label key={interest.value} className="subscription-interest">
                      <input type="checkbox" checked={form.interests.includes(interest.value)} onChange={() => toggleInterest(interest.value)} />
                      <span>{interest.label}</span>
                    </label>
                  ))}
                </div>
                <label className="subscription-consent">
                  <input type="checkbox" checked={form.consent} onChange={event => setForm(current => ({ ...current, consent: event.target.checked }))} />
                  <span>I agree to receive one monthly Build Level product and newsletter email. I can unsubscribe or manage my preferences at any time.</span>
                </label>
                <p style={{ color: "var(--text3)", fontSize: "0.76rem", lineHeight: 1.5 }}>
                  By subscribing, you can review our <Link to="/policies/privacy-policy" target="_blank">Privacy Policy</Link> and <Link to="/policies/terms-conditions" target="_blank">Terms and Conditions</Link>.
                </p>
                {error && <p className="subscription-error">{error}</p>}
                <button type="submit" disabled={sending} className="btn btn-primary" style={{ width: "100%" }}>{sending ? "Joining..." : "SUBSCRIBE"}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const value = useContext(SubscriptionContext);
  if (!value) throw new Error("useSubscription must be used inside SubscriptionProvider");
  return value;
}
