# BUILD LEVEL - Render Deployment Instructions

This repository deploys as one full-stack Render Web Service from the repo root.

## Render Blueprint

Use the root `render.yaml` when creating the service:

- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
- Start command: `pnpm start`
- Health check path: `/health`

The production build creates:

- `dist/public` - Vite frontend assets
- `dist/index.js` - bundled Express/tRPC backend

## Required Environment Variables

Set these in Render before deploying:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection URL for Drizzle |
| `JWT_SECRET` | Long random secret used to sign admin JWTs |
| `ADMIN_PASSWORD_HASH` | Scrypt admin password hash |

Generate an admin password hash locally with:

```bash
pnpm hash:password 'your-new-admin-password'
```

Copy the printed `salt:hash` value into `ADMIN_PASSWORD_HASH`.

## Payment Environment Variables

Set these when payment checkout is enabled:

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe server-side checkout key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe browser publishable key at build time |
| `PAYPAL_CLIENT_ID` | PayPal server client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal server client secret |
| `PAYPAL_ENV` | `sandbox` or `live` |
| `VITE_PAYPAL_CLIENT_ID` | PayPal browser client ID at build time |

## Optional Cross-Origin Frontend

If you later host the frontend separately from Render, set one or both:

| Variable | Purpose |
| --- | --- |
| `CORS_ORIGIN` | Allowed browser origin; comma-separated values are supported |
| `FRONTEND_URL` | Allowed frontend origin |

For the default full-stack Render deploy, the frontend and API are same-origin and these are not required.

## Post-Deploy Smoke Test

After Render finishes deploying:

1. Open `https://your-service.onrender.com/health` and confirm `{ "status": "ok" }`.
2. Open the site root and confirm the homepage loads.
3. Visit `/admin`, log in, and confirm products/settings load.
4. Test shop checkout only after Stripe or PayPal environment variables are configured.

## Public vs Admin Architecture

- Public customers should only use storefront routes such as `/`, `/shop`, `/blog`, `/digital`, `/checkout`, and content pages.
- Management routes live under `/admin` and are rendered through a separate admin shell.
- Admin APIs are under `/api/admin/*` and require the admin JWT or valid admin password token.
- Direct tRPC admin procedures are also protected by the shared admin middleware.
- Keep integration credentials and secret values in Render, Railway, Cloudflare, or protected admin settings. Do not add them to customer-facing pages.

Never commit real database URLs, JWT secrets, or payment keys to this repository.
