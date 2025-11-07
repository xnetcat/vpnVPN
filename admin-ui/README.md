admin-ui (Next.js)

- App Router, TypeScript, TailwindCSS
- Servers page reads from `/api/servers`

Paid access (Auth.js + Stripe)

- Auth providers: GitHub, Google (optional)
- Sessions/Users via Prisma (Postgres)
- Stripe subscription checkout, portal, and webhooks

Environment variables (see `env.local.example`):

- `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `GITHUB_ID`, `GITHUB_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`

Local dev:

1. `pnpm i`
2. `pnpm prisma:generate`
3. `pnpm dev`

Stripe webhook test (optional):

1. Install Stripe CLI and login
2. `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. Complete checkout from `/pricing` and verify account access to `/dashboard`

Vercel setup:

- Create a Vercel project pointing to `admin-ui`
- Build command: `pnpm build`
- Install command: `pnpm i`
- Output directory: `.next`
- Environment variables:
  - `NEXT_PUBLIC_API_BASE_URL` (optional for external API)
  - All variables listed above for auth and Stripe
