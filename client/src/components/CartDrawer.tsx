import { X, Plus, Minus, ShoppingBag } from "lucide-react";
import { useCart, CURRENCY_SYMBOLS, type Currency } from "@/contexts/CartContext";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const CURRENCIES: Currency[] = ["USD", "GBP", "EUR", "CAD", "AUD"];

export default function CartDrawer() {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeCartRef = useRef<() => void>(() => {});
  const {
    items,
    isOpen,
    closeCart,
    removeItem,
    updateQuantity,
    totalItems,
    subtotalUSD,
    convertPrice,
    currency,
    setCurrency,
  } = useCart();

  closeCartRef.current = closeCart;

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCartRef.current();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-[80]"
            aria-hidden="true"
            onClick={closeCart}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-drawer-title"
            className="fixed right-0 top-0 h-full w-full max-w-md bg-[#1A1A1A] z-[90] flex flex-col shadow-[-24px_0_60px_rgba(0,0,0,0.45)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <ShoppingBag size={20} className="text-[#FF6B00]" />
                <span id="cart-drawer-title" className="font-display text-sm tracking-widest text-white">
                  YOUR CART ({totalItems})
                </span>
              </div>
              <button
                ref={closeButtonRef}
                onClick={closeCart}
                className="text-[#888] hover:text-white transition-colors"
                aria-label="Close cart"
              >
                <X size={20} />
              </button>
            </div>

            {/* Currency Selector */}
            <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3">
              <span className="font-display text-[10px] tracking-widest text-[#888]">CURRENCY:</span>
              <div className="flex gap-2">
                {CURRENCIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`font-display text-[10px] tracking-wider px-2 py-1 transition-all ${
                      currency === c
                        ? "bg-[#FF6B00] text-white"
                        : "text-[#888] hover:text-white border border-white/10"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <ShoppingBag size={48} className="text-[#444] mb-4" />
                  <p className="font-display text-sm tracking-widest text-[#666]">
                    YOUR CART IS EMPTY
                  </p>
                  <p className="font-body text-xs text-[#555] mt-2">
                    Add some gear and level up.
                  </p>
                  <button
                    onClick={closeCart}
                    className="mt-6 btn-primary text-xs px-6 py-3"
                  >
                    SHOP NOW
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => (
                    <div
                      key={`${item.id}-${item.size}`}
                      className="flex gap-4 bg-[#2A2A2A] p-4 border border-white/5"
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-20 h-24 object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-[10px] tracking-widest text-[#888] mb-1">
                          {item.category}
                        </p>
                        <h4 className="font-display text-sm font-semibold text-white truncate mb-1">
                          {item.name}
                        </h4>
                        <p className="font-body text-xs text-[#888] mb-3">
                          Size: <span className="text-white">{item.size}</span>
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                updateQuantity(item.id, item.size, item.quantity - 1)
                              }
                              className="w-7 h-7 border border-white/20 flex items-center justify-center text-[#888] hover:border-[#FF6B00] hover:text-white transition-all"
                              aria-label={`Decrease quantity for ${item.name}`}
                            >
                              <Minus size={12} />
                            </button>
                            <span className="font-display text-sm text-white w-4 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(item.id, item.size, item.quantity + 1)
                              }
                              className="w-7 h-7 border border-white/20 flex items-center justify-center text-[#888] hover:border-[#FF6B00] hover:text-white transition-all"
                              aria-label={`Increase quantity for ${item.name}`}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-display text-sm font-bold text-[#FF6B00]">
                              {convertPrice(item.priceUSD * item.quantity)}
                            </span>
                            <button
                              onClick={() => removeItem(item.id, item.size)}
                              className="text-[#555] hover:text-red-400 transition-colors"
                              aria-label={`Remove ${item.name} from cart`}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="px-6 py-5 border-t border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs tracking-widest text-[#888]">SUBTOTAL</span>
                  <span className="font-display text-lg font-bold text-white">
                    {convertPrice(subtotalUSD)}
                  </span>
                </div>
                <p className="font-body text-xs text-[#666]">
                  Shipping & taxes calculated at checkout
                </p>
                <Link href="/checkout" onClick={closeCart}>
                  <span className="btn-primary w-full text-center text-sm py-4 block">
                    CHECKOUT
                  </span>
                </Link>
                <button
                  onClick={closeCart}
                  className="w-full text-center font-display text-xs tracking-widest text-[#666] hover:text-white transition-colors py-2"
                >
                  CONTINUE SHOPPING
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
