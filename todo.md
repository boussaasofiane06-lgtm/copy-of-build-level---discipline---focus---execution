# BUILD LEVEL — Project TODO

## E-Commerce Features
- [x] CartContext with multi-currency support (USD, GBP, EUR, CAD, AUD)
- [x] CartDrawer slide-out panel with quantity controls
- [x] Cart icon with badge in Navbar
- [x] Shop page with size selector and Add to Cart integration
- [x] Home page Best Sellers with Add to Cart integration
- [x] Checkout page with all payment method options (Card, Apple Pay, Google Pay, PayPal, Klarna, Afterpay)
- [x] Stripe checkout session creation via tRPC
- [x] Order Confirmation page
- [x] Free shipping threshold ($100+)
- [x] Multi-currency price display throughout site

## Pending (Requires User Action)
- [ ] Claim Stripe sandbox at https://dashboard.stripe.com/claim_sandbox/... to activate test payments
- [ ] Replace placeholder products with real product names, prices, and photos
- [ ] Replace placeholder logo with real brand logo
- [ ] Update social media handles (Instagram, TikTok)
- [ ] Update contact email address
- [x] Add PayPal full integration (live PayPal buttons with createOrder/captureOrder via tRPC — Klarna/Afterpay still coming soon)
- [ ] Add real customer reviews
- [ ] Update About page with real brand story

## Third-Party Integrations
- [x] Add Tidio AI chat widget (script placeholder ready in index.html — user must add their Tidio key to activate)
- [x] Add Shopify Buy Button support (Integrations page with full setup guide — user must connect their Shopify store)
- [x] Add Integrations page explaining Shopify + Printify setup workflow
- [x] Add integrations status section on Home page (Partners section linking to /integrations)

## Custom Notifications
- [x] Site visitor social proof pop-ups (e.g. "Someone just bought a hoodie")
- [x] Stock alert notifications (e.g. "Only 3 left in stock!")
- [x] Announcement banner (e.g. new drop, sale, free shipping)
- [x] Owner alert when a new order is placed
- [x] Owner alert when a new email signup occurs
- [x] Customer order confirmation notification on checkout success

## AI Customer Service Chat Widget
- [x] Build AI chat backend tRPC procedure with BUILD LEVEL knowledge base
- [x] Build branded chat widget UI (dark theme, orange accents, bottom-right bubble)
- [x] Wire chat widget globally across all pages

## PWA (Progressive Web App)
- [x] Create web app manifest (manifest.json) with BUILD LEVEL branding
- [x] Generate PWA icons (192x192 and 512x512)
- [x] Create service worker for offline support
- [x] Add install prompt banner for mobile users
- [x] Wire manifest and service worker into index.html

## Admin Panel
- [x] Add products table and site_settings table to database schema
- [x] Run db:push migration (tables created via SQL)
- [x] Build admin tRPC procedures (product CRUD, settings, image upload)
- [x] Build Admin Panel UI (product list, add/edit/delete, image upload, settings page)
- [x] Add admin-only route protection (only owner can access /admin)
- [x] Wire Shop and Home pages to load products from database
- [x] Ensure Shopify/Printify webhook endpoints are compatible (no conflicts)

## Digital Products & Audiobook Support
- [x] Digital Products page (/digital) with Stripe checkout and static fallback for Cloudflare
- [x] Discipline Mindset PDF created (13 pages, branded) and added to DB at $19.99
- [x] Cover image for Discipline Mindset PDF uploaded and displayed
- [x] Admin Digital tab with product CRUD
- [x] Audiobook support: productType selector (PDF/Audiobook/Video/Other) in admin
- [x] Conditional audioUrl and duration fields for audiobook/video types in admin
- [x] AudioPlayer component in Digital.tsx for audiobook product type

## Blog
- [x] Blog listing page (/blog)
- [x] Blog post detail page (/blog/[slug])
- [x] Admin Blog tab with create/publish/draft CRUD

## Manus Independence (Completed)
- [x] Remove notifyOwner from routers.ts (no Manus notification API)
- [x] Remove invokeLLM from routers.ts (no Manus LLM API)
- [x] Remove translationRouter import and usage from routers.ts
- [x] Remove storagePut from admin.ts (admin uses URL input instead)
- [x] Chat widget uses static keyword-based responses (no Manus LLM)
- [x] Digital page loads products dynamically from DB via tRPC
- [x] Push changes to GitHub → Render auto-deploys
- [x] Set up Cloudflare Pages Function proxy for /api/* → Render backend
- [x] Rebuild and redeploy frontend to Cloudflare Pages
- [ ] Verify Render deployment completes with API_ONLY=true and /api/trpc/* returns JSON
- [ ] Confirm Cloudflare Pages Function proxy works end-to-end on thebuildlevel.com

## Pending Future Items
- [ ] TikTok integration (clarify: display feed, TikTok Shop, or TikTok Pixel)
- [ ] PDF upload directly from admin panel (currently uses external URL links)
- [x] AI chat that actually answers customer questions (currently falls back to email — static keyword responses, no Manus dependency)
- [ ] info@buildlevel.com email setup (Cloudflare Email Routing)
