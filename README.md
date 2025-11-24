## vpnVPN - Privacy-First VPN SaaS Platform

Modern monorepo for a VPN SaaS, built with Bun + Turborepo, Next.js, Rust, and in-house services for the control plane and metrics. The stack is deployable to AWS but not tied to AWS‑only services.

### High-Level Architecture

- **Apps**
  - `apps/web`: Next.js 15 SaaS frontend (Vercel-ready) with tRPC, Stripe, NextAuth, Prisma.
  - `apps/desktop`: Tauri desktop app for configuring and connecting to the VPN.
  - `apps/vpn-server`: Rust VPN node supporting WireGuard/OpenVPN/IKEv2.
- **Services**
  - `services/control-plane`: Bun/TypeScript HTTP API for servers, peers, and tokens backed by Postgres.
  - `services/metrics`: Bun/TypeScript metrics ingestion API for vpn-server stats.
- **Shared**
  - `packages/db`: Shared Prisma/Postgres client and schema (Neon in prod, Postgres in dev).
  - `infra/pulumi`: AWS wrapper that provisions compute/networking and reads the control-plane URL from config.

### Quick Start (Monorepo)

```bash
git clone <repo-url>
cd vpnVPN

# Install dependencies with Bun
bun install

# Start the full local stack (Postgres + control-plane + metrics + vpn-node + web)
# plus the Tauri desktop shell and Stripe listener:
bun run dev

# Or run apps/services individually with Turbo:
bun run dev:turbo      # turbo run dev --parallel
```

See `docs/LOCAL_DEV.md` for full local stack instructions and `docs/ARCHITECTURE.md` for a deeper architecture overview.

### Tests & CI

- Unit/integration tests live under each app/service (Vitest for TS, `cargo test` for Rust).
- Turbo tasks:
  - `bun run lint` → `turbo run lint`
  - `bun run test` → `turbo run test`
  - `bun run build` → `turbo run build`

See `docs/CI_CD.md` for the GitHub Actions workflow and how Docker images are built and deployed.
