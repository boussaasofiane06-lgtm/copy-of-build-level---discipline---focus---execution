import { Link, useParams } from "react-router-dom";
import { faqItems, getPolicyBySlug, knowledgeBaseSections, policies } from "../lib/policies";

const pageShellStyle = {
  background: "radial-gradient(circle at top right, rgba(255,102,0,0.12), transparent 34%), var(--bg)",
  minHeight: "100%",
};

const cardStyle = {
  background: "linear-gradient(145deg, rgba(26,26,26,0.96), rgba(10,10,10,0.98))",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 20px 55px rgba(0,0,0,0.24)",
};

function PolicyHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "56px 0 36px" }}>
      <div className="container">
        <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 10 }}>
          Build Level Policy Center
        </div>
        <h1 style={{ marginBottom: 10 }}>{title}</h1>
        <p style={{ color: "var(--text2)", maxWidth: 760 }}>{subtitle}</p>
      </div>
    </div>
  );
}

export function PolicyCenter() {
  return (
    <div style={pageShellStyle}>
      <PolicyHero title="Policy Center" subtitle="Clear standards for returns, shipping, digital access, privacy, support, payments, and customer trust." />
      <div className="container section-sm">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 36 }}>
          {policies.map(policy => (
            <Link key={policy.slug} to={`/policies/${policy.slug}`} style={cardStyle}>
              <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                Last updated {policy.lastUpdated}
              </div>
              <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>{policy.title}</h3>
              <p style={{ color: "var(--text2)", fontSize: "0.86rem", lineHeight: 1.65 }}>{policy.subtitle}</p>
            </Link>
          ))}
          <Link to="/faq" style={cardStyle}>
            <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
              Customer Support
            </div>
            <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>FAQ Page</h3>
            <p style={{ color: "var(--text2)", fontSize: "0.86rem", lineHeight: 1.65 }}>Answers for orders, downloads, refunds, apparel, shipping, checkout, and support.</p>
          </Link>
        </div>
        <CustomerSupportKnowledgeBase />
      </div>
    </div>
  );
}

export function CustomerSupportKnowledgeBase() {
  return (
    <section style={cardStyle} id="customer-support-knowledge-base">
      <div style={{ color: "var(--red)", fontFamily: "var(--font-display)", fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>
        Tidio / Lyro AI Knowledge Base
      </div>
      <h2 style={{ marginBottom: 14 }}>Customer Support Knowledge Base</h2>
      <p style={{ color: "var(--text2)", lineHeight: 1.75, marginBottom: 22 }}>
        Tidio should answer only from these policy pages and FAQ answers. If a customer has a specific order issue, collect full name, email, order number, product purchased, and issue description, then tell the customer support will review the issue.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {knowledgeBaseSections.map(item => (
          <div key={item.heading} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, background: "rgba(255,255,255,0.025)" }}>
            <h3 style={{ fontSize: "0.9rem", marginBottom: 8 }}>{item.heading}</h3>
            <p style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.65 }}>{item.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FAQPage() {
  return (
    <div style={pageShellStyle}>
      <PolicyHero title="FAQ" subtitle="Fast answers for Build Level customers before and after checkout." />
      <div className="container section-sm" style={{ maxWidth: 940 }}>
        <div style={{ display: "grid", gap: 14, marginBottom: 32 }}>
          {faqItems.map(item => (
            <details key={item.question} style={cardStyle}>
              <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{item.question}</summary>
              <p style={{ color: "var(--text2)", marginTop: 12, lineHeight: 1.75 }}>{item.answer}</p>
            </details>
          ))}
        </div>
        <CustomerSupportKnowledgeBase />
      </div>
    </div>
  );
}

export default function PolicyPage() {
  const { slug } = useParams<{ slug: string }>();
  const policy = getPolicyBySlug(slug);

  if (!policy) {
    return (
      <div style={pageShellStyle}>
        <PolicyHero title="Policy Not Found" subtitle="The policy you are looking for could not be found." />
        <div className="container section-sm">
          <Link to="/policies" className="btn btn-primary">Back to Policy Center</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={pageShellStyle}>
      <PolicyHero title={policy.title} subtitle={policy.subtitle} />
      <div className="container section-sm" style={{ maxWidth: 960 }}>
        <div style={{ ...cardStyle, marginBottom: 28 }}>
          <p style={{ color: "var(--text3)", fontSize: "0.82rem", marginBottom: 22 }}>Last updated: {policy.lastUpdated}</p>
          <div style={{ display: "grid", gap: 26 }}>
            {policy.sections.map(section => (
              <section key={section.heading}>
                <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>{section.heading}</h2>
                {section.body && <p style={{ color: "var(--text2)", lineHeight: 1.85 }}>{section.body}</p>}
                {section.bullets && (
                  <ul style={{ color: "var(--text2)", lineHeight: 1.85, paddingLeft: 20, marginTop: section.body ? 10 : 0 }}>
                    {section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link to="/policies" className="btn btn-outline btn-sm">Policy Center</Link>
          <Link to="/faq" className="btn btn-primary btn-sm">FAQ</Link>
          <Link to="/contact" className="btn btn-outline btn-sm">Contact Support</Link>
        </div>
      </div>
    </div>
  );
}
