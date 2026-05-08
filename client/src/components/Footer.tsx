/* ==========================================================================
   BUILD LEVEL — Footer Component
   Design: Dark footer with brand tagline, nav links, social icons
   ========================================================================== */

import { Link } from "wouter";
import { Instagram } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#2A2A2A] border-t border-white/5">
      {/* Top section */}
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-16 grid grid-cols-1 md:grid-cols-3 gap-12">
        {/* Brand */}
        <div>
          <div className="font-display text-2xl font-bold tracking-[0.15em] text-white mb-4">
            BUILD<span className="text-[#FF6B00]"> LEVEL</span>
          </div>
          <p className="text-[#888] text-sm leading-relaxed font-body max-w-[220px]">
            Discipline • Focus • Execution
          </p>
          <p className="text-[#555] text-xs mt-4 font-body leading-relaxed">
            Premium motivational streetwear for those obsessed with growth.
          </p>
        </div>

        {/* Navigation */}
        <div>
          <h4 className="font-display text-xs tracking-[0.3em] text-[#FF6B00] mb-6">Navigate</h4>
          <ul className="space-y-3">
            {[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              { label: "About", href: "/about" },
              { label: "Contact", href: "/contact" },
              { label: "FAQ", href: "/faq" },
              { label: "Integrations", href: "/integrations" },
            ].map((link) => (
              <li key={link.href}>
                <Link href={link.href}>
                  <span className="text-[#888] hover:text-white transition-colors text-sm font-body">
                    {link.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Social & Contact */}
        <div>
          <h4 className="font-display text-xs tracking-[0.3em] text-[#FF6B00] mb-6">Connect</h4>
          <div className="space-y-3">
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-[#888] hover:text-white transition-colors text-sm font-body"
            >
              <Instagram size={16} />
              @buildlevel
            </a>
            <a
              href="https://tiktok.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-[#888] hover:text-white transition-colors text-sm font-body"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
              </svg>
              @buildlevel
            </a>
            <a
              href="mailto:info@buildlevel.com"
              className="flex items-center gap-3 text-[#888] hover:text-white transition-colors text-sm font-body"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              info@buildlevel.com
            </a>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/5 max-w-[1280px] mx-auto px-6 lg:px-10 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-[#444] text-xs font-body">
          © {new Date().getFullYear()} BUILD LEVEL. All rights reserved.
        </p>
        <div className="flex items-center gap-6">
          <span className="text-[#444] text-xs font-body">Privacy Policy</span>
          <span className="text-[#444] text-xs font-body">Terms of Service</span>
          <span className="text-[#444] text-xs font-body">Shipping Policy</span>
        </div>
      </div>
    </footer>
  );
}
