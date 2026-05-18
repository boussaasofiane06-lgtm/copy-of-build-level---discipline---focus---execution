import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CartProvider } from "./contexts/CartContext";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import About from "./pages/About";
import Contact from "./pages/Contact";
import FAQ from "./pages/FAQ";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Digital from "./pages/Digital";
import DigitalDownload from "./pages/DigitalDownload";
import SocialProofNotification from "./components/SocialProofNotification";
import AIChatWidget from "./components/AIChatWidget";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

const Admin = lazy(() => import("./pages/Admin"));

function PublicRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/shop" component={Shop} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/faq" component={FAQ} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/order-confirmation" component={OrderConfirmation} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/digital" component={Digital} />
      <Route path="/digital/download" component={DigitalDownload} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AdminApp() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Suspense fallback={<div className="min-h-screen bg-[#111] text-white flex items-center justify-center font-display tracking-widest">LOADING ADMIN</div>}>
            <Admin />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function App() {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
    return <AdminApp />;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <CartProvider>
          <TooltipProvider>
            <Toaster />
            <SocialProofNotification />
            <AIChatWidget />
            <PWAInstallPrompt />
            <PublicRouter />
          </TooltipProvider>
        </CartProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
