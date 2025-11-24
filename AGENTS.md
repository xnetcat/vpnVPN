# AGENTS.md

## Setup commands

- **Frontend & Desktop:**
  - Install deps (monorepo): `bun install`
  - Start full local stack + desktop app: `bun run dev` (Docker: web, control-plane, metrics, vpn-server + local Tauri desktop, Stripe listener)
  - Start web app only: `cd apps/web && bun run dev`
  - Start desktop app only: `cd apps/desktop && bun run dev`
  - Run tests: `bun run test` or `cd apps/web && bun run test`
  - Lint: `bun run lint` or `cd apps/web && bun run lint`
- **Infra (Control Plane):**
  - Deploy: `cd infra/pulumi && pulumi up`
  - Install deps: `cd infra/pulumi && bun install`
- **VPN Server (Rust):**
  - Build: `cd apps/vpn-server && cargo build`
  - Run: `cd apps/vpn-server && cargo run -- --help`

## Deployment

- **Frontend:**
  - Hosted on **Vercel**.
  - Environment variables configured in Vercel Dashboard.
  - Database (Postgres/Neon) connection string required.
- **Backend (Control Plane & Metrics):**
  - Implemented as in-house Bun/TypeScript HTTP services in `services/control-plane` and `services/metrics`.
  - Backed by Postgres via the shared Prisma schema in `packages/db`.
  - Deployed as generic containers (AWS is used only as a hosting platform, via Pulumi/ECR/EC2 or ECS).
- **Data Plane (VPN Nodes):**
  - Infrastructure-agnostic (EC2, VPS, etc.).
  - Deployed via Docker or binary.

## Code style

- **General:**
  - Use latest stable versions of all packages.
  - Prefer `bun` for Node.js/TypeScript package management.
  - No secrets in code (use environment variables).
- **Frontend (Next.js):**
  - **Directory:** `apps/web/`
  - TypeScript strict mode enabled.
  - React Server Components (RSC) by default.
  - Use `lucide-react` for icons.
  - Tailwind CSS for styling (sorted classes).
  - **SaaS Features:**
    - **Auth:** NextAuth.js (SSO: Google, GitHub; Email: Magic Link).
    - **Billing:** Stripe (Multi-tier Subscriptions: Basic, Pro, Enterprise; Webhooks).
    - **Notifications:** Resend for transactional emails (welcome, subscription changes, device alerts).
- **Backend (Pulumi/AWS):**
  - **Directory:** `infra/pulumi/`
  - TypeScript for IaC.
  - Provisions AWS networking/compute for the Rust `vpn-server` container and observability (AMP/Grafana).
  - Reads the control-plane URL (`controlPlaneApiUrl` config) instead of creating Lambda/APIGW/DynamoDB resources.
- **Rust (VPN Server):**
  - **Directory:** `apps/vpn-server/`
  - `clippy` must pass.
  - `tracing` for structured logging.
  - No PII logging.
  - Use `clap` for CLI arguments.

## Feature Specifications

### SaaS Frontend (`apps/web`)

- **Authentication:** NextAuth.js.
- **Billing:** Stripe Subscriptions (Monthly/Yearly).
- **Dashboard:**
  - User: Subscription status, "Add Device" (generate config), Usage graphs.
  - Admin: Server fleet status, User management.
- **Deployment:** Vercel.

### Control Plane API

- **Architecture:** AWS Serverless.
- **Endpoints:**
  - `POST /server/register`: Node self-registration.
  - `GET /server/peers`: Sync allowed peers.
  - `POST /webhooks/stripe`: Billing events.
- **Security:** Signed requests or Bearer tokens.

### VPN Server

- **Core:** Rust binary.
- **Networking:** WireGuard, OpenVPN, IKEv2.
- **Privacy:** No traffic logging.
- **Operation:** Autonomous sync loop with Control Plane.

## Testing instructions

- **Frontend:** `cd apps/web && bun run test` (Vitest).
- **Rust:** `cd apps/vpn-server && cargo test`.
- **Integration:** `bun run test:local` to verify full system flow (Signup -> Connect) using the local Docker Compose stack.

## Development Workflow

1.  Check `docs/TODO.md` for tasks.
2.  Edit files in the appropriate directory.
3.  Run linters/tests.
4.  Commit changes.
