import { MaintenanceConfig } from "../lib/api";

export default function Maintenance({ config }: { config: MaintenanceConfig }) {
  return (
    <main className="maintenance-page">
      <div className="maintenance-page__ambient" aria-hidden="true" />
      <section className="maintenance-page__panel">
        <div className="promo-kicker">Build Level</div>
        <h1>{config.title || "Coming Back Soon"}</h1>
        <p>{config.message || "BUILD LEVEL is upgrading the experience. The storefront will return shortly."}</p>
        {config.returnText && <div className="maintenance-page__return">{config.returnText}</div>}
        <a href={`mailto:${config.contactEmail || "info@thebuildlevel.com"}`} className="btn btn-primary">
          Contact Us
        </a>
      </section>
    </main>
  );
}
