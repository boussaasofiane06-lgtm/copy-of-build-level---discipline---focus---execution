/* ==========================================================================
   BUILD LEVEL — Checkout Page
   Supports: Stripe (Cards, Apple Pay, Google Pay), PayPal, Klarna, Afterpay
   ========================================================================== */

import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CreditCard, Lock, ShieldCheck, Truck } from "lucide-react";
import { Link } from "wouter";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useCart, CURRENCY_SYMBOLS, type Currency } from "@/contexts/CartContext";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string;

const CURRENCIES: Currency[] = ["USD", "GBP", "EUR", "CAD", "AUD"];

type PaymentMethod = "card" | "paypal" | "apple_pay" | "google_pay" | "klarna" | "afterpay";

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string; description: string }[] = [
  { id: "card", label: "Credit / Debit Card", icon: "💳", description: "Visa, Mastercard, Amex" },
  { id: "apple_pay", label: "Apple Pay", icon: "🍎", description: "Pay with Touch ID or Face ID" },
  { id: "google_pay", label: "Google Pay", icon: "🔵", description: "Fast checkout with Google" },
  { id: "paypal", label: "PayPal", icon: "🅿️", description: "Pay with your PayPal balance" },
  { id: "klarna", label: "Klarna", icon: "🟣", description: "Buy now, pay in 4 installments" },
  { id: "afterpay", label: "Afterpay", icon: "🟢", description: "Pay over 6 weeks, interest-free" },
];

// Inner checkout component — needs access to cart context
function CheckoutInner() {
  const [, navigate] = useLocation();
  const { items, subtotalUSD, convertPrice, currency, setCurrency, clearCart } = useCart();
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>("card");
  const [isProcessing, setIsProcessing] = useState(false);
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    address: "",
    city: "",
    country: "US",
    zip: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvc: "",
    cardName: "",
  });

  const shippingUSD = subtotalUSD >= 100 ? 0 : 9.99;
  const totalUSD = subtotalUSD + shippingUSD;

  const createCheckout = trpc.shop.createCheckoutSession.useMutation({
    onSuccess: (data: { url: string | null; sessionId: string }) => {
      if (data.url) {
        window.open(data.url, "_blank");
        toast.info("Redirecting to secure checkout...");
      }
    },
    onError: (err: { message: string }) => {
      toast.error("Checkout failed: " + err.message);
      setIsProcessing(false);
    },
  });

  const createPayPalOrder = trpc.shop.createPayPalOrder.useMutation();
  const capturePayPalOrder = trpc.shop.capturePayPalOrder.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    setIsProcessing(true);

    if (selectedPayment === "card" || selectedPayment === "apple_pay" || selectedPayment === "google_pay") {
      createCheckout.mutate({
        items: items.map((i) => ({
          name: i.name,
          priceUSD: i.priceUSD,
          quantity: i.quantity,
          image: i.image,
        })),
        currency: currency.toLowerCase(),
        customerEmail: form.email,
        paymentMethod: selectedPayment,
      });
    } else if (selectedPayment === "klarna") {
      toast.info("Redirecting to Klarna...");
      setTimeout(() => {
        toast.success("Klarna checkout coming soon! Use card payment for now.");
        setIsProcessing(false);
      }, 1500);
    } else if (selectedPayment === "afterpay") {
      toast.info("Redirecting to Afterpay...");
      setTimeout(() => {
        toast.success("Afterpay checkout coming soon! Use card payment for now.");
        setIsProcessing(false);
      }, 1500);
    } else {
      // PayPal — handled by PayPalButtons below, not by form submit
      setIsProcessing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#2A2A2A]">
        <Navbar />
        <div className="pt-32 pb-24 flex flex-col items-center justify-center text-center px-6">
          <h2 className="font-display text-3xl font-bold text-white mb-4">YOUR CART IS EMPTY</h2>
          <p className="font-body text-[#888] mb-8">Add some gear before checking out.</p>
          <Link href="/shop">
            <span className="btn-primary text-sm px-8 py-4">SHOP NOW</span>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#2A2A2A]">
      <Navbar />

      <div className="pt-24 pb-16">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          {/* Back */}
          <Link href="/shop">
            <span className="flex items-center gap-2 text-[#888] hover:text-white transition-colors font-display text-xs tracking-widest mb-8 w-fit">
              <ArrowLeft size={14} /> BACK TO SHOP
            </span>
          </Link>

          <h1 className="font-display text-4xl md:text-5xl font-bold text-white mb-10">
            CHECK<span className="text-[#FF6B00]">OUT</span>
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* LEFT — Form */}
            <form onSubmit={handleSubmit} className="space-y-8">

              {/* Currency */}
              <div>
                <label className="font-display text-xs tracking-widest text-[#888] mb-3 block">
                  CURRENCY
                </label>
                <div className="flex gap-2 flex-wrap">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      className={`font-display text-xs tracking-wider px-3 py-2 transition-all ${
                        currency === c
                          ? "bg-[#FF6B00] text-white"
                          : "border border-white/15 text-[#888] hover:text-white hover:border-white/40"
                      }`}
                    >
                      {CURRENCY_SYMBOLS[c]} {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact */}
              <div>
                <h3 className="font-display text-sm tracking-widest text-white mb-4 pb-2 border-b border-white/10">
                  CONTACT INFORMATION
                </h3>
                <div className="space-y-3">
                  <input
                    type="email"
                    required
                    placeholder="Email address"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="checkout-input"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="First name"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      className="checkout-input"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Last name"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      className="checkout-input"
                    />
                  </div>
                </div>
              </div>

              {/* Shipping */}
              <div>
                <h3 className="font-display text-sm tracking-widest text-white mb-4 pb-2 border-b border-white/10">
                  SHIPPING ADDRESS
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    required
                    placeholder="Street address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="checkout-input"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="City"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="checkout-input"
                    />
                    <input
                      type="text"
                      required
                      placeholder="ZIP / Postal code"
                      value={form.zip}
                      onChange={(e) => setForm({ ...form, zip: e.target.value })}
                      className="checkout-input"
                    />
                  </div>
                  <select
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="checkout-input"
                  >
                    <option value="US">United States</option>
                    <option value="GB">United Kingdom</option>
                    <option value="CA">Canada</option>
                    <option value="AU">Australia</option>
                    <option value="DE">Germany</option>
                    <option value="FR">France</option>
                    <option value="JP">Japan</option>
                    <option value="NG">Nigeria</option>
                    <option value="ZA">South Africa</option>
                    <option value="AE">UAE</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <h3 className="font-display text-sm tracking-widest text-white mb-4 pb-2 border-b border-white/10">
                  PAYMENT METHOD
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPayment(method.id)}
                      className={`p-3 border text-left transition-all ${
                        selectedPayment === method.id
                          ? "border-[#FF6B00] bg-[#FF6B00]/10"
                          : "border-white/10 hover:border-white/30 bg-[#333]"
                      }`}
                    >
                      <div className="text-xl mb-1">{method.icon}</div>
                      <div className="font-display text-xs font-semibold text-white">
                        {method.label}
                      </div>
                      <div className="font-body text-[10px] text-[#888] mt-0.5">
                        {method.description}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Card fields */}
                {selectedPayment === "card" && (
                  <div className="space-y-3 p-4 bg-[#333] border border-white/10">
                    <input
                      type="text"
                      placeholder="Name on card"
                      value={form.cardName}
                      onChange={(e) => setForm({ ...form, cardName: e.target.value })}
                      className="checkout-input"
                    />
                    <input
                      type="text"
                      placeholder="Card number (4242 4242 4242 4242 for test)"
                      maxLength={19}
                      value={form.cardNumber}
                      onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
                      className="checkout-input font-mono"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="MM / YY"
                        maxLength={5}
                        value={form.cardExpiry}
                        onChange={(e) => setForm({ ...form, cardExpiry: e.target.value })}
                        className="checkout-input font-mono"
                      />
                      <input
                        type="text"
                        placeholder="CVC"
                        maxLength={4}
                        value={form.cardCvc}
                        onChange={(e) => setForm({ ...form, cardCvc: e.target.value })}
                        className="checkout-input font-mono"
                      />
                    </div>
                  </div>
                )}

                {(selectedPayment === "apple_pay" || selectedPayment === "google_pay") && (
                  <div className="p-4 bg-[#333] border border-white/10 text-center">
                    <p className="font-body text-sm text-[#888]">
                      You will be redirected to complete payment via{" "}
                      <span className="text-white">
                        {selectedPayment === "apple_pay" ? "Apple Pay" : "Google Pay"}
                      </span>{" "}
                      through our secure Stripe checkout.
                    </p>
                  </div>
                )}

                {/* PayPal Buttons — live integration */}
                {selectedPayment === "paypal" && (
                  <div className="p-4 bg-[#333] border border-white/10">
                    <p className="font-body text-xs text-[#888] mb-4 text-center">
                      Click the PayPal button below to complete your purchase securely.
                    </p>
                    {PAYPAL_CLIENT_ID ? (
                      <PayPalButtons
                        style={{ layout: "vertical", color: "gold", shape: "rect", label: "paypal" }}
                        createOrder={async () => {
                          const result = await createPayPalOrder.mutateAsync({
                            items: items.map((i) => ({
                              name: i.name,
                              priceUSD: i.priceUSD,
                              quantity: i.quantity,
                            })),
                          });
                          if (!result.orderId) throw new Error("Failed to create PayPal order");
                          return result.orderId;
                        }}
                        onApprove={async (data) => {
                          try {
                            setIsProcessing(true);
                            const result = await capturePayPalOrder.mutateAsync({
                              orderId: data.orderID,
                            });
                            if (result.status === "COMPLETED") {
                              clearCart();
                              toast.success("Payment successful! Thank you for your order.");
                              navigate("/order-confirmation?session=" + data.orderID);
                            } else {
                              toast.error("Payment not completed. Please try again.");
                            }
                          } catch (err: unknown) {
                            const msg = err instanceof Error ? err.message : "Payment failed";
                            toast.error("PayPal error: " + msg);
                          } finally {
                            setIsProcessing(false);
                          }
                        }}
                        onError={(err) => {
                          console.error("PayPal error:", err);
                          toast.error("PayPal encountered an error. Please try another payment method.");
                        }}
                        onCancel={() => {
                          toast.info("PayPal payment cancelled.");
                        }}
                      />
                    ) : (
                      <p className="font-body text-xs text-[#FF6B00] text-center">
                        PayPal is not configured. Please use card payment.
                      </p>
                    )}
                  </div>
                )}

                {(selectedPayment === "klarna" || selectedPayment === "afterpay") && (
                  <div className="p-4 bg-[#333] border border-white/10 text-center">
                    <p className="font-body text-sm text-[#888]">
                      You will be redirected to{" "}
                      <span className="text-white capitalize">{selectedPayment}</span> to complete
                      your purchase securely.
                    </p>
                  </div>
                )}
              </div>

              {/* Security badges */}
              <div className="flex items-center gap-6 py-4 border-t border-white/10">
                <div className="flex items-center gap-2 text-[#888]">
                  <Lock size={14} />
                  <span className="font-body text-xs">SSL Encrypted</span>
                </div>
                <div className="flex items-center gap-2 text-[#888]">
                  <ShieldCheck size={14} />
                  <span className="font-body text-xs">Secure Payment</span>
                </div>
                <div className="flex items-center gap-2 text-[#888]">
                  <Truck size={14} />
                  <span className="font-body text-xs">Worldwide Shipping</span>
                </div>
              </div>

              {/* Submit button — hidden for PayPal (handled by PayPalButtons) */}
              {selectedPayment !== "paypal" && (
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="btn-primary w-full py-5 text-sm tracking-[0.2em] flex items-center justify-center gap-3 disabled:opacity-60"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      PROCESSING...
                    </>
                  ) : (
                    <>
                      <CreditCard size={16} />
                      PLACE ORDER — {convertPrice(totalUSD)}
                    </>
                  )}
                </button>
              )}
            </form>

            {/* RIGHT — Order Summary */}
            <div className="lg:sticky lg:top-24 h-fit">
              <div className="bg-[#1A1A1A] border border-white/10 p-6">
                <h3 className="font-display text-sm tracking-widest text-white mb-6 pb-3 border-b border-white/10">
                  ORDER SUMMARY
                </h3>

                <div className="space-y-4 mb-6">
                  {items.map((item) => (
                    <div key={`${item.id}-${item.size}`} className="flex gap-4">
                      <div className="relative">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-16 h-20 object-cover"
                        />
                        <span className="absolute -top-2 -right-2 bg-[#FF6B00] text-white text-[9px] font-display w-5 h-5 rounded-full flex items-center justify-center">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="font-display text-xs font-semibold text-white">{item.name}</p>
                        <p className="font-body text-[10px] text-[#888] mt-0.5">Size: {item.size}</p>
                        <p className="font-body text-xs text-[#FF6B00] mt-1">
                          {convertPrice(item.priceUSD * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 pt-4 border-t border-white/10">
                  <div className="flex justify-between">
                    <span className="font-body text-xs text-[#888]">Subtotal</span>
                    <span className="font-body text-xs text-white">{convertPrice(subtotalUSD)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-body text-xs text-[#888]">Shipping</span>
                    <span className="font-body text-xs text-white">
                      {shippingUSD === 0 ? "FREE" : convertPrice(shippingUSD)}
                    </span>
                  </div>
                  {shippingUSD > 0 && (
                    <p className="font-body text-[10px] text-[#888]">
                      Free shipping on orders over {convertPrice(100)}
                    </p>
                  )}
                  <div className="flex justify-between pt-3 border-t border-white/10">
                    <span className="font-display text-sm font-bold text-white">TOTAL</span>
                    <span className="font-display text-sm font-bold text-[#FF6B00]">
                      {convertPrice(totalUSD)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Trust badges */}
              <div className="mt-4 p-4 bg-[#1A1A1A] border border-white/10">
                <p className="font-display text-[10px] tracking-widest text-[#888] mb-3">
                  ACCEPTED PAYMENTS
                </p>
                <div className="flex gap-3 flex-wrap">
                  {["💳 Visa", "💳 Mastercard", "💳 Amex", "🅿️ PayPal", "🍎 Apple Pay", "🔵 Google Pay"].map(
                    (p) => (
                      <span key={p} className="font-body text-[10px] text-[#888] bg-[#333] px-2 py-1">
                        {p}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

// Outer wrapper provides PayPal script context
export default function Checkout() {
  return (
    <PayPalScriptProvider
      options={{
        clientId: PAYPAL_CLIENT_ID || "test",
        currency: "USD",
        intent: "capture",
      }}
    >
      <CheckoutInner />
    </PayPalScriptProvider>
  );
}
