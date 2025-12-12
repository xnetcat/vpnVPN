## vpnVPN - Privacy-First VPN SaaS Platform

Modern monorepo for a VPN SaaS, built with Bun + Turborepo, Next.js, Rust, and in-house services for the control plane and metrics. The stack is deployable to AWS but not tied to AWS‑only services.

### High-Level Architecture

- **Apps**
  - `apps/web`: Next.js 15 SaaS frontend (Vercel-ready) with tRPC, Stripe, NextAuth, Prisma.
  - `apps/desktop`: Tauri desktop app with a privileged Rust daemon for VPN management. Supports WireGuard, OpenVPN, and IKEv2.
  - `apps/vpn-server`: Rust VPN node agent supporting WireGuard, OpenVPN, and IKEv2 with control-plane integration.
- **Services**
  - `services/control-plane`: Bun/Fastify HTTP API for servers, peers, tokens, and registration. Deployed as Lambda via Docker.
  - `services/metrics`: Bun/Fastify metrics ingestion API for vpn-server stats. Deployed as Lambda via Docker.
- **Shared**
  - `packages/db`: Shared Prisma/Postgres client and schema (Neon in prod, Postgres in dev).
  - `infra/pulumi`: AWS infrastructure (Lambda, API Gateway, EC2 with Elastic IPs, ECR, S3).

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

### Deployment

```bash
# Deploy to staging
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production
```

The deployment script:

- Loads environment from root `.env`
- Deploys global infrastructure to us-east-1
- Builds and pushes vpn-server Docker image
- Deploys VPN nodes to regions in `scripts/regions.json`
- Builds desktop apps with hardcoded API endpoints
- Uploads desktop executables to S3

See `docs/CI_CD.md` for detailed deployment documentation.

### Tests & CI

- Unit/integration tests live under each app/service (Vitest for TS, `cargo test` for Rust).
- Turbo tasks:
  - `bun run lint` → `turbo run lint`
  - `bun run test` → `turbo run test`
  - `bun run build` → `turbo run build`

See `docs/CI_CD.md` for the GitHub Actions workflow and how Docker images are built and deployed.
