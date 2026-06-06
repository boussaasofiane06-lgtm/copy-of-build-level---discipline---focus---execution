import { useEffect, useState } from "react";
import { useCart } from "../context/CartContext";
import { useSubscription } from "../context/SubscriptionContext";

const DISMISS_KEY = "buildlevel_monthly_build_tab_dismissed";

export default function SubscriptionFloatingTab() {
  const cart = useCart();
  const { openSubscription, isSubscriptionOpen } = useSubscription();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "true");

  useEffect(() => {
    if (dismissed) sessionStorage.setItem(DISMISS_KEY, "true");
  }, [dismissed]);

  if (dismissed || cart.isOpen || isSubscriptionOpen) return null;

  return (
    <div className="monthly-build-tab" aria-label="Monthly Build subscription">
      <button type="button" onClick={() => openSubscription("desktop_tab")}>GET THE MONTHLY BUILD</button>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss monthly build tab">×</button>
    </div>
  );
}
