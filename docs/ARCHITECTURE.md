# Architecture Overview

vpnVPN is a Bun/Turborepo monorepo with a TypeScript/Postgres control plane and Rust VPN data plane.

## Apps

### `apps/web`

Next.js 15 SaaS frontend hosted on Vercel.

- tRPC for type-safe API calls
- NextAuth.js for authentication (GitHub, Google, Email)
- Stripe for subscriptions
- Resend for transactional emails
- Prisma + PostgreSQL for data persistence

### `apps/desktop`

Tauri desktop client for configuring and connecting to the VPN.

### `apps/vpn-server`

Rust VPN node binary supporting WireGuard, OpenVPN, and IKEv2.

- Generates and persists WireGuard server keys
- Registers with control plane via `POST /server/register`
- Periodically fetches peers via `GET /server/peers`
- Applies peers to WireGuard/OpenVPN/IKEv2 backends
- Exposes admin API (`/health`, `/metrics`, `/status`, `/pubkey`) on `ADMIN_PORT`

## Services

### `services/control-plane`

Bun + Fastify HTTP API backed by Postgres via `@vpnvpn/db`.

**Endpoints:**

| Endpoint | Description |
| -------- | ----------- |
| `POST /server/register` | VPN node self-registration (bearer token auth) |
| `GET /server/peers` | Fetch peers assigned to a server (bearer token auth) |
| `GET /servers` | List all servers with metrics (API key auth) |
| `POST /peers` | Create/update a user peer (API key auth) |
| `POST /peers/revoke-for-user` | Revoke all peers for a user (API key auth) |
| `DELETE /peers/:publicKey` | Revoke a specific peer (API key auth) |

**Security:** Bearer tokens for VPN nodes, `x-api-key` header for web app calls.

### `services/metrics`

Bun + Fastify HTTP API for vpn-server metrics ingestion.

**Endpoint:** `POST /metrics/vpn` — accepts CPU, memory, active peers, and region data.

Persists metrics to Postgres for dashboard views.

## Shared Database

### `packages/db`

Prisma schema and client for:

- **SaaS data:** users, sessions, accounts, subscriptions, devices, notification preferences
- **Control plane:** VpnServer, VpnPeer, VpnToken, VpnMetric
- **Desktop:** DesktopLoginCode

Uses `DATABASE_URL` (Neon in production, Postgres in local Docker).

## Frontend Integration

The web app uses tRPC routers to:

- Manage devices, subscriptions, and admin actions
- Call the control-plane service via `lib/controlPlane.ts` using `CONTROL_PLANE_API_URL` + `CONTROL_PLANE_API_KEY`

### Device Registration Flow

1. User clicks "Add Device" in the dashboard
2. Server generates a WireGuard keypair
3. Device record is stored in Postgres
4. Control-plane service is called to create the peer
5. Client config is rendered for download/QR code

## Deployment

### Web App

Deployed to Vercel with environment variables configured in the Vercel dashboard.

### Control Plane & Metrics

Deployed as containers (ECS, EC2, Kubernetes, or on-prem). Environment-agnostic.

### VPN Server

Deployed via Pulumi to AWS:

- ECR repository for Docker images
- EC2 Auto Scaling Group behind Network Load Balancer
- Security groups for VPN protocols (WireGuard, OpenVPN, IKEv2)
- Target-tracking autoscaling based on ActiveSessions metric

Pulumi reads `controlPlaneApiUrl` from config to connect VPN nodes to the control plane.

### Multi-Environment Support

The same containers can run on:

- AWS (EC2, ECS, EKS)
- Kubernetes
- Docker Compose (local development)
- On-premises servers

No AWS-specific services are required for the control plane or metrics services.
