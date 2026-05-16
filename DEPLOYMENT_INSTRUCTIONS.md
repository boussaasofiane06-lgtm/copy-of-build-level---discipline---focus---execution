# BUILD LEVEL — Complete Deployment Instructions

## What You Have
A fully independent production-ready codebase with:
- **No Manus dependencies** — zero Manus APIs, agents, or services
- **Backend**: Express + TypeScript + Drizzle ORM (Railway MySQL)
- **Frontend**: React + Vite + TailwindCSS
- **Admin panel**: JWT-secured at `/admin`
- **All pages**: Home, Shop, Digital Products, Blog, About, Contact

---

## Step 1: Push to GitHub

1. Create a new GitHub repository (e.g., `buildlevel-production`)
2. Extract the ZIP file
3. Push:
```bash
cd buildlevel-clean
git remote add origin https://github.com/YOUR_USERNAME/buildlevel-production.git
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy Backend on Render.com

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/index.js`
   - **Environment**: Node

4. Add these **Environment Variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `mysql://root:tqRlvBfhYoeHOKLeWubcaiwUSSJbTNnk@yamanote.proxy.rlwy.net:11501/railway` |
| `ADMIN_PASSWORD_HASH` | `a1f97709e72dc67b9f15df8d90aedbe3:700702b27925556c07dc96d9cbcb914693427b17025a9226d86abdf3e60838a1` |
| `JWT_SECRET` | `e9135aecd11f0dc75c8c27ba3a527f590cbd88238a391c5ab4639a72db97711cc6d802ecd638968071f54d52196846df86fb97ef3a1f720e5feae0bd9a54e6b7` |
| `CORS_ORIGIN` | `https://YOUR-SITE.pages.dev` (update after Cloudflare deploy) |
| `NODE_ENV` | `production` |

5. Click **Create Web Service** — wait for deploy
6. Note your backend URL: `https://YOUR-BACKEND.onrender.com`

---

## Step 3: Deploy Frontend on Cloudflare Pages

1. Go to [pages.cloudflare.com](https://pages.cloudflare.com) → **Create a project**
2. Connect your GitHub repo
3. Settings:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Build Output Directory**: `dist`
   - **Framework preset**: None (Vite)

4. Add **Environment Variable**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://YOUR-BACKEND.onrender.com` |

5. Click **Save and Deploy**
6. Note your frontend URL: `https://YOUR-SITE.pages.dev`

---

## Step 4: Update CORS on Render

Go back to Render → your backend → Environment Variables:
- Update `CORS_ORIGIN` to your actual Cloudflare Pages URL

Then trigger a **Manual Deploy** on Render.

---

## Step 5: Test Your Site

1. Visit `https://YOUR-SITE.pages.dev` — homepage should load
2. Visit `https://YOUR-SITE.pages.dev/admin` — admin panel
3. Admin password: `!@#$9379&*()`
4. Create a product, blog post, digital product — all should work

---

## Admin Panel Features
- `/admin` — Dashboard
- Add/edit/delete physical products
- Add/edit/delete digital products
- Add/edit/delete blog posts
- Manage affiliate products
- Manage membership tiers
- Site settings

---

## Changing Admin Password

```bash
cd backend
node scripts/hash-password.mjs 'your-new-password'
```

Copy the output and update `ADMIN_PASSWORD_HASH` in Render environment variables.

---

## Stripe Integration (Optional)

Add to Render environment variables:
- `STRIPE_SECRET_KEY` — from Stripe dashboard
- `STRIPE_WEBHOOK_SECRET` — from Stripe webhook settings

Add to Cloudflare Pages environment variables:
- `VITE_STRIPE_PUBLISHABLE_KEY` — from Stripe dashboard

---

## Database Schema

All tables are already created in Railway MySQL:
- `products` — physical products
- `digital_products` — downloadable products
- `blog_posts` — blog content
- `affiliate_products` — affiliate links
- `membership_tiers` — membership plans
- `orders` — customer orders
- `site_settings` — site configuration

---

## Support

If you need to regenerate the database schema:
```bash
cd backend
DATABASE_URL="your-railway-url" npx drizzle-kit generate && npx drizzle-kit migrate
```
