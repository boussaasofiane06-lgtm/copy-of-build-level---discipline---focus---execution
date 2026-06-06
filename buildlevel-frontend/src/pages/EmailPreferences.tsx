import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { publicApi } from "../lib/api";
import { SUBSCRIPTION_INTERESTS } from "../components/SubscribeForm";

export default function EmailPreferences() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [active, setActive] = useState(true);
  const [interests, setInterests] = useState<string[]>(["all_updates"]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    publicApi.getEmailPreferences(token)
      .then(result => {
        setEmail(result.subscriber.email);
        setFirstName(result.subscriber.firstName || "");
        setActive(result.subscriber.status === "active");
        const enabled = result.subscriber.interests.filter(item => item.enabled).map(item => item.interest);
        setInterests(enabled.length ? enabled : ["all_updates"]);
      })
      .catch(err => setError(err?.response?.data?.error || "Preferences link is invalid."))
      .finally(() => setLoading(false));
  }, [token]);

  const toggle = (value: string) => {
    setInterests(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await publicApi.updateEmailPreferences(token, { firstName, active, interests: interests.length ? interests : ["all_updates"] });
      setMessage(active ? "Your Build Level preferences were saved." : "You have been unsubscribed.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not save preferences.");
    }
  };

  const unsubscribe = async () => {
    setError("");
    try {
      await publicApi.unsubscribe(token);
      setActive(false);
      setMessage("You have been unsubscribed.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Could not unsubscribe.");
    }
  };

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "56px 0 36px" }}>
        <div className="container">
          <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", letterSpacing: "0.16em", textTransform: "uppercase", fontSize: "0.75rem", marginBottom: 10 }}>Email Preferences</p>
          <h1>Manage Build Level Emails</h1>
        </div>
      </div>
      <div className="container section-sm" style={{ maxWidth: 720 }}>
        <div className="card" style={{ padding: 28 }}>
          {loading ? <div className="spinner" /> : error && !email ? (
            <div>
              <p style={{ color: "var(--red)", marginBottom: 18 }}>{error}</p>
              <Link to="/" className="btn btn-primary">Return Home</Link>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
              <div>
                <label>Email</label>
                <input className="input" disabled value={email} />
              </div>
              <div>
                <label>First name</label>
                <input className="input" value={firstName} onChange={event => setFirstName(event.target.value)} />
              </div>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />
                <span>Receive Build Level product and newsletter emails</span>
              </label>
              <div className="subscribe-interest-grid">
                {SUBSCRIPTION_INTERESTS.map(interest => (
                  <label key={interest.value} className="subscribe-interest">
                    <input type="checkbox" checked={interests.includes(interest.value)} onChange={() => toggle(interest.value)} disabled={!active} />
                    <span>{interest.label}</span>
                  </label>
                ))}
              </div>
              {message && <p style={{ color: "#ff6600" }}>{message}</p>}
              {error && <p style={{ color: "var(--red)" }}>{error}</p>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="submit" className="btn btn-primary">Save Preferences</button>
                <button type="button" onClick={unsubscribe} className="btn btn-outline">Unsubscribe Completely</button>
              </div>
              <p style={{ color: "var(--text3)", fontSize: "0.8rem" }}>
                Transactional emails such as receipts, downloads, fulfillment, and tracking remain separate from marketing preferences.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
