# AGENTS.md

## Setup commands

- **Frontend:**
  - Install deps: `cd web-app && pnpm install`
  - Start dev server: `cd web-app && pnpm dev`
  - Run tests: `cd web-app && pnpm test`
  - Lint: `cd web-app && pnpm lint`
- **Infra (Control Plane):**
  - Deploy: `cd infra/pulumi && pulumi up`
  - Install deps: `cd infra/pulumi && pnpm install`
- **VPN Server (Rust):**
  - Build: `cd vpn-server && cargo build`
  - Run: `cd vpn-server && cargo run -- --help`

## Deployment

- **Frontend:**
  - Hosted on **Vercel**.
  - Environment variables configured in Vercel Dashboard.
  - Database (Postgres) connection string required.
- **Backend (Control Plane):**
  - Hosted on **AWS** (Lambda, API Gateway, DynamoDB).
  - Deployed via **Pulumi**.
- **Data Plane (VPN Nodes):**
  - Infrastructure-agnostic (EC2, VPS, etc.).
  - Deployed via Docker or binary.

## Code style

- **General:**
  - Use latest stable versions of all packages.
  - Prefer `pnpm` for Node.js package management.
  - No secrets in code (use environment variables).
- **Frontend (Next.js):**
  - **Directory:** `web-app/`
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
  - Lambda functions should be small and focused (Node.js 20.x).
  - DynamoDB for state.
- **Rust (VPN Server):**
  - **Directory:** `vpn-server/`
  - `clippy` must pass.
  - `tracing` for structured logging.
  - No PII logging.
  - Use `clap` for CLI arguments.

## Feature Specifications

### SaaS Frontend (`web-app`)

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

- **Frontend:** `cd web-app && pnpm test` (Vitest).
- **Rust:** `cd vpn-server && cargo test`.
- **Integration:** Use `local/test-flow.sh` to verify full system flow (Signup -> Connect) using the local Docker Compose stack.

## Development Workflow

1.  Check `docs/TODO.md` for tasks.
2.  Edit files in the appropriate directory.
3.  Run linters/tests.
4.  Commit changes.
