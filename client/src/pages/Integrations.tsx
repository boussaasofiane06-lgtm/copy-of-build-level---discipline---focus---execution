/* ==========================================================================
   BUILD LEVEL — Integrations & Partners Page
   Setup guides for Shopify, Printify, Tidio AI Chat, AliExpress dropshipping
   ========================================================================== */

import { Link } from "wouter";
import { ExternalLink, ShoppingBag, Package, MessageCircle, Truck, CheckCircle, ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const integrations = [
  {
    id: "shopify",
    icon: <ShoppingBag size={28} className="text-[#FF6B00]" />,
    name: "Shopify",
    badge: "RECOMMENDED",
    tagline: "Full store & checkout management",
    description:
      "Shopify handles your entire store backend — payments, inventory, order management, customer emails, and returns. Embed a Shopify Buy Button on your BUILD LEVEL site so customers check out through Shopify's secure, trusted platform.",
    url: "https://shopify.com",
    urlLabel: "shopify.com",
    steps: [
      "Create a free Shopify trial at shopify.com",
      "Add your BUILD LEVEL products with photos, prices, and variants (sizes/colors)",
      "Go to Shopify Admin → Sales Channels → Buy Button",
      "Generate a Buy Button embed code for each product",
      "Paste the embed code into your BUILD LEVEL product pages",
      "Customers click Buy Now → Shopify handles the checkout",
    ],
    highlight: "Shopify processes your payments and handles all customer order emails automatically.",
  },
  {
    id: "printify",
    icon: <Package size={28} className="text-[#FF6B00]" />,
    name: "Printify",
    badge: "ZERO INVENTORY",
    tagline: "Print-on-demand fulfillment",
    description:
      "Design your BUILD LEVEL products once on Printify — hoodies, t-shirts, hats, accessories. When a customer orders, Printify automatically prints and ships directly to them. You never touch the product. No upfront stock costs.",
    url: "https://printify.com",
    urlLabel: "printify.com",
    steps: [
      "Create a free account at printify.com",
      "Choose a print provider (Printify has 90+ global suppliers)",
      "Upload your BUILD LEVEL designs and logo to products",
      "Connect Printify to your Shopify store (one-click integration)",
      "Products sync automatically — customer orders, Printify ships",
      "You keep the profit margin between your price and Printify's cost",
    ],
    highlight: "Recommended workflow: Printify → Shopify → BUILD LEVEL site. Zero inventory, fully automated.",
  },
  {
    id: "tidio",
    icon: <MessageCircle size={28} className="text-[#FF6B00]" />,
    name: "Tidio AI Chat",
    badge: "AI POWERED",
    tagline: "24/7 automated customer support",
    description:
      "Tidio adds an AI-powered chat widget to your site that automatically answers customer questions about shipping, sizing, returns, and order status — 24 hours a day, 7 days a week. No staff needed.",
    url: "https://tidio.com",
    urlLabel: "tidio.com",
    steps: [
      "Create a free account at tidio.com",
      "Set up your AI chatbot — train it with your FAQs and policies",
      "Copy your unique Public Key from Tidio Settings → Developer",
      "Open the file client/index.html in your downloaded ZIP",
      "Find the commented Tidio line and replace YOUR_TIDIO_PUBLIC_KEY with your key",
      "Remove the comment tags (<!-- and -->) to activate the widget",
    ],
    highlight: "The Tidio script is already prepared in your site's code — just add your key to activate it.",
    codeSnippet: `<!-- Already in your index.html — just uncomment and add your key -->
<script src="//code.tidio.co/YOUR_TIDIO_PUBLIC_KEY.js" async></script>`,
  },
  {
    id: "aliexpress",
    icon: <Truck size={28} className="text-[#FF6B00]" />,
    name: "AliExpress Dropshipping",
    badge: "DROPSHIPPING",
    tagline: "Source products, supplier ships direct",
    description:
      "Use AliExpress as a product source for dropshipping. Tools like DSers or AutoDS connect AliExpress suppliers to your Shopify store. A customer orders on your site, the AliExpress supplier ships directly to them worldwide.",
    url: "https://dsers.com",
    urlLabel: "dsers.com",
    steps: [
      "Create a Shopify store (required as the middle layer)",
      "Install DSers (free) from the Shopify App Store",
      "Browse AliExpress for products that match your brand",
      "Import products to your Shopify store via DSers with one click",
      "Set your own prices (markup over supplier cost)",
      "Customer orders → DSers auto-orders from AliExpress → supplier ships",
    ],
    highlight: "Best for accessories, hats, and non-branded items. Use Printify for branded BUILD LEVEL apparel.",
  },
];

const recommendedStack = [
  { layer: "Your Website (Front-End)", tool: "BUILD LEVEL (this site)", purpose: "Brand presence, marketing, product showcase" },
  { layer: "Store & Checkout", tool: "Shopify", purpose: "Payments, orders, customer management" },
  { layer: "Branded Apparel", tool: "Printify → Shopify", purpose: "Print hoodies, tees, hats on demand" },
  { layer: "Customer Support", tool: "Tidio AI Chat", purpose: "24/7 automated answers to customer questions" },
  { layer: "Accessories (optional)", tool: "AliExpress via DSers", purpose: "Dropship non-branded products" },
];

export default function Integrations() {
  return (
    <div className="min-h-screen bg-[#2A2A2A]">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-[#1A1A1A]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <p className="section-label">Partners & Integrations</p>
          <h1 className="font-display text-4xl md:text-6xl font-bold text-white leading-tight mb-6">
            AUTOMATE YOUR<br />
            <span className="text-[#FF6B00]">ENTIRE BUSINESS.</span>
          </h1>
          <p className="font-body text-[#888] text-lg max-w-[600px]">
            Connect BUILD LEVEL with the right tools and run a fully automated e-commerce business — no warehouse, no manual shipping, no 24/7 customer service staff needed.
          </p>
        </div>
      </section>

      {/* Recommended Stack */}
      <section className="py-16 bg-[#2A2A2A]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="mb-10">
            <p className="section-label">Recommended Setup</p>
            <h2 className="font-display text-3xl font-bold text-white">
              YOUR COMPLETE <span className="text-[#FF6B00]">STACK</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left font-display text-xs tracking-widest text-[#888] py-3 pr-6">LAYER</th>
                  <th className="text-left font-display text-xs tracking-widest text-[#888] py-3 pr-6">TOOL</th>
                  <th className="text-left font-display text-xs tracking-widest text-[#888] py-3">PURPOSE</th>
                </tr>
              </thead>
              <tbody>
                {recommendedStack.map((row, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-4 pr-6 font-display text-sm text-white">{row.layer}</td>
                    <td className="py-4 pr-6">
                      <span className="font-display text-sm font-bold text-[#FF6B00]">{row.tool}</span>
                    </td>
                    <td className="py-4 font-body text-sm text-[#888]">{row.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Integration Cards */}
      <section className="py-16 bg-[#333]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="mb-12">
            <p className="section-label">Step-by-Step Setup</p>
            <h2 className="font-display text-3xl font-bold text-white">
              HOW TO <span className="text-[#FF6B00]">CONNECT EACH TOOL</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {integrations.map((item) => (
              <div
                key={item.id}
                className="bg-[#2A2A2A] border border-white/5 p-8 hover:border-[#FF6B00]/30 transition-all duration-300"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <div>
                      <h3 className="font-display text-xl font-bold text-white">{item.name}</h3>
                      <p className="font-body text-xs text-[#888]">{item.tagline}</p>
                    </div>
                  </div>
                  <span className="font-display text-[10px] tracking-widest text-white bg-[#FF6B00] px-3 py-1 whitespace-nowrap">
                    {item.badge}
                  </span>
                </div>

                {/* Description */}
                <p className="font-body text-sm text-[#C0C0B8] leading-relaxed mb-6">
                  {item.description}
                </p>

                {/* Steps */}
                <div className="mb-6">
                  <p className="font-display text-xs tracking-widest text-[#FF6B00] mb-3">SETUP STEPS</p>
                  <ol className="space-y-2">
                    {item.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="font-display text-xs text-[#FF6B00] font-bold mt-0.5 flex-shrink-0">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="font-body text-xs text-[#888] leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Code snippet for Tidio */}
                {item.codeSnippet && (
                  <div className="bg-[#1A1A1A] border border-white/10 p-4 mb-6 overflow-x-auto">
                    <pre className="font-mono text-xs text-[#FF6B00] whitespace-pre-wrap">{item.codeSnippet}</pre>
                  </div>
                )}

                {/* Highlight */}
                <div className="flex items-start gap-3 bg-[#FF6B00]/10 border border-[#FF6B00]/20 p-4 mb-6">
                  <CheckCircle size={14} className="text-[#FF6B00] flex-shrink-0 mt-0.5" />
                  <p className="font-body text-xs text-[#C0C0B8] leading-relaxed">{item.highlight}</p>
                </div>

                {/* CTA */}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-display text-xs tracking-widest text-[#FF6B00] hover:text-white transition-colors"
                >
                  VISIT {item.urlLabel.toUpperCase()} <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#FF6B00]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 text-center">
          <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-4">
            READY TO LAUNCH?
          </h2>
          <p className="font-body text-white/80 text-lg mb-10 max-w-[480px] mx-auto">
            Your BUILD LEVEL store is ready. Connect your tools and start selling worldwide.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/shop">
              <span className="inline-flex items-center gap-2 bg-[#2A2A2A] text-white px-8 py-4 font-display text-sm tracking-widest hover:bg-[#1A1A1A] transition-colors cursor-pointer">
                VIEW SHOP <ArrowRight size={14} />
              </span>
            </Link>
            <a
              href="https://shopify.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border-2 border-white text-white px-8 py-4 font-display text-sm tracking-widest hover:bg-white hover:text-[#FF6B00] transition-colors"
            >
              START ON SHOPIFY <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
