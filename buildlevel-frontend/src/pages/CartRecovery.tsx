import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { publicApi } from "../lib/api";
import { useCart } from "../context/CartContext";

export default function CartRecovery() {
  const { token = "" } = useParams();
  const cart = useCart();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Recovery link is missing.");
      return;
    }
    publicApi.recoverCart(token)
      .then(result => {
        cart.restoreFromSavedCart(result.cart);
        setState("ready");
      })
      .catch(error => {
        setState("error");
        setMessage(error?.response?.data?.error || "This recovery link is expired or invalid.");
      });
  }, [token]);

  return (
    <div>
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "56px 0 36px" }}>
        <div className="container">
          <p style={{ color: "var(--red)", fontFamily: "var(--font-display)", letterSpacing: "0.16em", textTransform: "uppercase", fontSize: "0.75rem", marginBottom: 10 }}>
            Build Level Cart
          </p>
          <h1>Return to Your Cart</h1>
        </div>
      </div>
      <div className="container section-sm" style={{ maxWidth: 720 }}>
        <div className="card" style={{ padding: 30, textAlign: "center" }}>
          {state === "loading" && <><div className="spinner" style={{ margin: "0 auto 18px" }} /><p style={{ color: "var(--text2)" }}>Restoring your saved cart...</p></>}
          {state === "ready" && (
            <>
              <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>Your cart is restored.</h2>
              <p style={{ color: "var(--text2)", marginBottom: 22 }}>Your Build Level selections are ready when you are.</p>
              <button type="button" onClick={cart.openCart} className="btn btn-primary" style={{ marginRight: 10 }}>View Cart</button>
              <Link to="/shop" className="btn btn-outline">Continue Shopping</Link>
            </>
          )}
          {state === "error" && (
            <>
              <h2 style={{ fontSize: "1.2rem", marginBottom: 10 }}>Cart link unavailable</h2>
              <p style={{ color: "var(--text2)", marginBottom: 22 }}>{message}</p>
              <Link to="/shop" className="btn btn-primary">Shop Build Level</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
