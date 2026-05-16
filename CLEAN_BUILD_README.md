# BUILD LEVEL — Production Deployment

## Architecture
- **Frontend**: React + Vite → Cloudflare Pages
- **Backend**: Express + TypeScript → Render.com
- **Database**: MySQL → Railway

## Quick Deploy

### 1. Backend (Render.com)
1. Connect your GitHub repo to Render
2. Set Root Directory: `backend`
3. Build Command: `npm install && npm run build`
4. Start Command: `node dist/index.js`
5. Add environment variables (see below)

### 2. Frontend (Cloudflare Pages)
1. Connect your GitHub repo to Cloudflare Pages
2. Set Root Directory: `frontend`
3. Build Command: `npm install && npm run build`
4. Output Directory: `dist`
5. Add environment variable: `VITE_API_URL=https://your-render-backend.onrender.com`

## Environment Variables

### Backend (Render.com)
| Variable | Description |
|---|---|
| `DATABASE_URL` | Railway MySQL URL |
| `ADMIN_PASSWORD_HASH` | Scrypt hash of admin password |
| `JWT_SECRET` | Random secret for JWT signing |
| `CORS_ORIGIN` | Your Cloudflare Pages URL |
| `STRIPE_SECRET_KEY` | Stripe secret key (optional) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret (optional) |

### Frontend (Cloudflare Pages)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Your Render.com backend URL |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (optional) |

## Admin Panel
- URL: `https://your-site.pages.dev/admin`
- Default password: `!@#$9379&*()`
- Change via: generate new hash with `node scripts/hash-password.mjs <newpassword>` and update `ADMIN_PASSWORD_HASH`
