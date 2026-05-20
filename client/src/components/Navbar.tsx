/* ==========================================================================
   BUILD LEVEL — Navbar Component
   Design: Sticky dark header, Oswald nav links, orange CTA, mobile hamburger menu
   ========================================================================== */

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import AnnouncementBanner from "./AnnouncementBanner";
import { AnimatePresence, motion } from "framer-motion";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Blog", href: "/blog" },
  { label: "Digital", href: "/digital" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const { totalItems, openCart } = useCart();

  useBodyScrollLock(menuOpen);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  const handleOpenCart = () => {
    setMenuOpen(false);
    openCart();
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[60]">
        <AnnouncementBanner />
      </div>
      <header
        className={`fixed left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "top-0" : "top-[38px]"} ${
          scrolled ? "bg-[#2A2A2A]/95 backdrop-blur-sm border-b border-white/5" : "bg-transparent"
        }`}
      >
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/">
            <span className="font-display text-xl font-bold tracking-[0.15em] text-white">
              BUILD<span className="text-[#FF6B00]"> LEVEL</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <span
                  className={`nav-link text-[11px] ${
                    location === link.href ? "text-[#FF6B00]" : ""
                  }`}
                  aria-current={location === link.href ? "page" : undefined}
                >
                  {link.label}
                </span>
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-4">
            {/* Cart Icon */}
            <button
              type="button"
              onClick={handleOpenCart}
              className="relative text-white hover:text-[#FF6B00] transition-colors"
              aria-label="Open cart"
            >
              <ShoppingBag size={22} />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-[#FF6B00] text-white text-[9px] font-display font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {totalItems > 9 ? "9+" : totalItems}
                </span>
              )}
            </button>

            <Link href="/shop">
              <span className="hidden md:inline-flex btn-primary text-xs px-5 py-2.5">
                Shop Now
              </span>
            </Link>
            <button
              type="button"
              className="md:hidden text-white"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            key="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-[#2A2A2A] flex flex-col items-center justify-center"
          >
            <nav className="flex flex-col items-center gap-8">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
                  <span className="font-display text-3xl font-bold tracking-widest text-white hover:text-[#FF6B00] transition-colors">
                    {link.label}
                  </span>
                </Link>
              ))}
              <Link href="/shop" onClick={() => setMenuOpen(false)}>
                <span className="btn-primary mt-4 text-sm">Shop Now</span>
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
