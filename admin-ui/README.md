admin-ui (Next.js)

- App Router, TypeScript, TailwindCSS
- Servers page reads from `/api/servers` (mock)

Local dev:

1. `pnpm i`
2. `pnpm dev`

Vercel setup:

- Create a Vercel project pointing to `admin-ui`
- Build command: `pnpm build`
- Install command: `pnpm i`
- Output directory: `.next`
- Environment variables:
  - `NEXT_PUBLIC_API_BASE_URL` (optional for external API)
