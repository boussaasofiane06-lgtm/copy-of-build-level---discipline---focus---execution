import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import TidioWidget from "./components/TidioWidget";
import { PageTransition } from "./components/Motion";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import Digital from "./pages/Digital";
import DigitalSuccess from "./pages/DigitalSuccess";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Admin from "./pages/Admin";
import Maintenance from "./pages/Maintenance";
import PolicyPage, { FAQPage, PolicyCenter } from "./pages/PolicyPage";
import { MaintenanceConfig, publicApi } from "./lib/api";

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
          <Route path="/digital/success" element={<DigitalSuccess />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/policies" element={<PolicyCenter />} />
          <Route path="/policies/:slug" element={<PolicyPage />} />
          <Route path="/faq" element={<FAQPage />} />
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

const defaultMaintenance: MaintenanceConfig = {
  enabled: false,
  title: "Coming Back Soon",
  message: "BUILD LEVEL is upgrading the experience. The storefront will return shortly.",
  returnText: "Discipline. Focus. Execution.",
  contactEmail: "info@thebuildlevel.com",
};

function PublicStorefrontShell() {
  const [maintenance, setMaintenance] = useState<MaintenanceConfig>(defaultMaintenance);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    publicApi.getMaintenanceConfig()
      .then(config => {
        if (!cancelled) setMaintenance({ ...defaultMaintenance, ...config });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && maintenance.enabled) {
    return <Maintenance config={maintenance} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <PublicRoutes />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteInteractionCleanup />
      <TidioWidget />
      <Routes>
        {/* Admin route — no navbar/footer */}
        <Route path="/admin" element={<Admin />} />

        {/* Public routes */}
        <Route path="*" element={<PublicStorefrontShell />} />
      </Routes>
    </BrowserRouter>
  );
}
