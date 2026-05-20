import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import { PageTransition } from "./components/Motion";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import Digital from "./pages/Digital";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Admin from "./pages/Admin";

function RouteInteractionCleanup() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.body.style.overflow = "";
  }, [pathname]);

  return null;
}

function PublicRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <PageTransition key={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/digital" element={<Digital />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={
            <div style={{ textAlign: "center", padding: 120 }}>
              <h1 style={{ marginBottom: 16 }}>404</h1>
              <p style={{ color: "var(--text2)", marginBottom: 32 }}>Page not found.</p>
              <a href="/" className="btn btn-primary">Go Home</a>
            </div>
          } />
        </Routes>
      </PageTransition>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteInteractionCleanup />
      <Routes>
        {/* Admin route — no navbar/footer */}
        <Route path="/admin" element={<Admin />} />

        {/* Public routes */}
        <Route path="*" element={
          <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <Navbar />
            <main style={{ flex: 1 }}>
              <PublicRoutes />
            </main>
            <Footer />
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
