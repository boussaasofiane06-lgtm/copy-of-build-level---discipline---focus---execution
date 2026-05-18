# BUILD LEVEL - Clean Build Notes

The deployable app lives at the repository root.

## Local Verification

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm build
pnpm start
```

Open `http://localhost:3000/health` to verify the server is running.

## Render Deployment

Deploy from the root `render.yaml`. Render should build with pnpm, run the root production build, and start `dist/index.js` through `pnpm start`.

Required runtime values:

- `DATABASE_URL`
- `JWT_SECRET`
- `ADMIN_PASSWORD_HASH`

Generate `ADMIN_PASSWORD_HASH` with:

```bash
pnpm hash:password 'your-new-admin-password'
```

Payment-related variables are documented in `DEPLOYMENT_INSTRUCTIONS.md`.
