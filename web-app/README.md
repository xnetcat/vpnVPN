web-app (Next.js SaaS frontend)

This app is the public marketing site, user dashboard, and admin panel for vpnVPN.

- App Router, TypeScript (strict), TailwindCSS.
- User dashboard (`/dashboard`) for subscription status, device management, and server selection.
- Admin panel (`/admin`) for fleet monitoring, node token management, and proxy pool inspection.

Authentication & billing (Auth.js + Stripe)

- Auth providers: GitHub, Google, email (magic link).
- Sessions/Users via Prisma (Postgres).
- Stripe subscription checkout, billing portal, and webhooks to keep `Subscription` records in sync.

Environment variables (see `env.local.example` for local dev)

- Database & auth:
  - `DATABASE_URL`
  - `NEXTAUTH_URL`
  - `NEXTAUTH_SECRET`
- OAuth:
  - `GITHUB_ID`, `GITHUB_SECRET`
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Stripe:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_ID`
- Control plane:
  - `NEXT_PUBLIC_API_BASE_URL` (base URL of the AWS control-plane HTTP API).

Local development

1. `cd web-app`
2. `pnpm install`
3. Ensure Postgres is running and `DATABASE_URL` points to it.
4. `pnpm prisma:generate`
5. `pnpm dev`

To test Stripe webhooks locally:

1. Install Stripe CLI and login.
2. Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
3. Complete checkout from `/pricing` and verify account access to `/dashboard`.

Vercel setup

- Create a Vercel project pointing to `web-app`.
- Build command: `pnpm build`
- Install command: `pnpm install`
- Output directory: `.next`
- Configure all environment variables above in the Vercel dashboard (no `.env` committed).
