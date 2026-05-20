import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "./Motion";

export const PROMO_IMAGES = {
  gym: "/images/gym-buildlevel.png",
  athlete: "/images/focus-athlete.png",
  mountain: "/images/mountain-legacy.png",
};

export function BuildLevelHero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="promo-hero">
      <img
        className="promo-hero__image"
        src={PROMO_IMAGES.athlete}
        alt="Build Level athlete focused before execution"
        loading="eager"
        decoding="async"
      />
      <div className="promo-hero__shade" aria-hidden="true" />
      <div className="promo-particles" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="container promo-hero__content">
        <Reveal>
          <div className="promo-readable-panel promo-readable-panel--hero">
            <div className="promo-kicker">Build Level Standard</div>
            <motion.h1
              className="promo-hero__headline"
              animate={reduceMotion ? undefined : { opacity: [0.92, 1, 0.92] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            >
              DISCIPLINE <span>•</span> EXECUTION <span>•</span> LEGACY
            </motion.h1>
            <p className="promo-hero__copy">
              Premium apparel and digital systems for builders who train focus, move with discipline, and execute daily.
            </p>
            <div className="promo-hero__actions">
              <Link to="/shop" className="btn btn-primary btn-lg">Shop Apparel</Link>
              <Link to="/digital" className="btn btn-outline btn-lg">Digital Products</Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function GymMotivationSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`promo-split ${compact ? "promo-split--compact" : ""}`}>
      <div className="container promo-split__grid">
        <Reveal className="promo-split__media">
          <img
            src={PROMO_IMAGES.gym}
            alt="Build Level luxury gym motivation"
            loading="lazy"
            decoding="async"
          />
          <div className="promo-split__glow" aria-hidden="true" />
        </Reveal>
        <Reveal className="promo-split__content promo-readable-panel promo-readable-panel--split" delay={0.08}>
          <div className="promo-kicker">Apparel Energy</div>
          <h2>Built in the Gym. Worn Everywhere.</h2>
          <p>
            Blacked-out essentials, orange-lit details, and a disciplined fit system made for training days, work days, and street-level execution.
          </p>
          <div className="promo-stat-row">
            <span>Premium Fit</span>
            <span>Daily Utility</span>
            <span>Gym Ready</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function MountainLegacySection({ title = "Built Different." }: { title?: string }) {
  return (
    <section className="legacy-banner">
      <img
        className="legacy-banner__image"
        src={PROMO_IMAGES.mountain}
        alt="Mountain legacy discipline landscape"
        loading="lazy"
        decoding="async"
      />
      <div className="legacy-banner__shade" aria-hidden="true" />
      <Reveal className="legacy-banner__content promo-readable-panel promo-readable-panel--legacy">
        <div className="promo-kicker">Legacy Mindset</div>
        <h2>{title}</h2>
        <div className="legacy-banner__lines">
          <span>Built Different.</span>
          <span>Stay Focused.</span>
          <span>Execute Daily.</span>
        </div>
      </Reveal>
    </section>
  );
}
