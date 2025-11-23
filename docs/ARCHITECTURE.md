## Architecture Overview

vpnVPN is a Bun/Turborepo monorepo with a TypeScript/Postgres control plane and Rust VPN data plane.

### Apps

- `apps/web`: Next.js 15 SaaS frontend (Vercel).
- `apps/desktop`: Tauri desktop client for configuring the VPN.
- `apps/vpn-server`: Rust VPN node binary supporting WireGuard/OpenVPN/IKEv2.

### Services

- `services/control-plane`
  - Bun + Fastify HTTP API.
  - Endpoints for:
    - `POST /peers` – create/update a user peer.
    - `POST /peers/revoke-for-user` – revoke all peers for a user.
    - `DELETE /peers/:publicKey` – revoke a specific peer.
  - Stores servers, peers, tokens, and metrics metadata in Postgres via `@vpnvpn/db`.
  - Secured via `x-api-key` (`CONTROL_PLANE_API_KEY`).

- `services/metrics`
  - Bun + Fastify HTTP API.
  - `POST /metrics/vpn` – vpn-server metrics ingestion (CPU, memory, active peers, region).
  - Persists metrics into the shared Postgres database for dashboard views.

### Shared Database

- `packages/db`
  - Prisma schema and client for:
    - SaaS data: users, sessions, subscriptions, devices, notifications.
    - Control plane: `VpnServer`, `VpnPeer`, `VpnToken`, `VpnMetric`.
  - Uses `DATABASE_URL` (Neon in production, Postgres in local Docker).

### VPN Server (Rust)

- `apps/vpn-server`
  - Generates and persists its own WireGuard server keys and config.
  - Registers with the control plane via `POST /server/register` (via `ControlPlaneClient`).
  - Periodically fetches peers (`GET /server/peers`) and applies them to the local WireGuard/OpenVPN/IKEv2 backends.
  - Exposes an admin API (`/health`, `/metrics`, `/status`, `/pubkey`) on `ADMIN_PORT`.

### Frontend Integration

- Web app uses tRPC routers to:
  - Manage devices, subscriptions, admin actions.
  - Call the control-plane service via `lib/controlPlane.ts` using `CONTROL_PLANE_API_URL` + `CONTROL_PLANE_API_KEY`.
- When a user adds a device:
  1. The server generates a WireGuard keypair.
  2. The device record is stored in Postgres.
  3. The control-plane service is called to create/update the peer for that user.
  4. A client config is rendered for the desktop/mobile VPN client.

### Deployment

- AWS is used only as a hosting platform:
  - `infra/pulumi` provisions:
    - ECR repositories and/or ECS/EC2 resources for the containerized vpn-server.
    - Networking (VPC, security groups, load balancers).
  - The control-plane and metrics services are deployed as generic containers; Pulumi reads `controlPlaneApiUrl` from config, instead of creating Lambdas/APIGW/DynamoDB.
- Other environments (Kubernetes, on-prem) can run the same containers/Docker Compose without changes to application code.


