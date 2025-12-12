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

Tauri desktop client with a privileged Rust daemon for VPN management.

**Architecture:**

```
┌─────────────────┐   IPC (JSON-RPC)   ┌──────────────────┐
│   Tauri GUI     │ ◄───────────────► │  Daemon (Rust)   │
│ (unprivileged)  │   Unix Socket      │  (privileged)    │
└─────────────────┘                    └──────────────────┘
        │                                      │
        │ React + Vite                         │ VPN Backends
        ▼                                      ▼
┌─────────────────┐                    ┌──────────────────┐
│   Web UI        │                    │ wg-quick/openvpn │
│                 │                    │ strongSwan/IKEv2 │
└─────────────────┘                    └──────────────────┘
```

**Key Features:**

- React + Vite frontend bundled into Tauri native app
- Privileged daemon handles VPN operations (requires root/admin)
- IPC via Unix socket (`/var/run/vpnvpn-daemon.sock` production, `/tmp/vpnvpn-daemon.sock` dev)
- Deep link support for `vpnvpn://` protocol
- Supports WireGuard, OpenVPN, and IKEv2 protocols
- Built for macOS, Linux, and Windows

See `apps/desktop/DEVELOPMENT.md` for daemon development details.

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

**Deployment Options:**

1. **AWS Lambda + API Gateway** (production)
2. **Docker container** (self-hosted)
3. **Direct execution** (development)

**Endpoints:**

| Endpoint                      | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| `POST /server/register`       | VPN node self-registration (bearer token auth)       |
| `GET /server/peers`           | Fetch peers assigned to a server (bearer token auth) |
| `GET /servers`                | List all servers with metrics (API key auth)         |
| `DELETE /servers/:id`         | Delete a VPN server (API key auth)                   |
| `POST /peers`                 | Create/update a user peer (API key auth)             |
| `POST /peers/revoke-for-user` | Revoke all peers for a user (API key auth)           |
| `DELETE /peers/:publicKey`    | Revoke a specific peer (API key auth)                |
| `GET /tokens`                 | List all VPN node tokens (API key auth)              |
| `POST /tokens`                | Create a new token (API key auth)                    |
| `DELETE /tokens/:token`       | Revoke a token (API key auth)                        |

**Security:** Bearer tokens for VPN nodes, `x-api-key` header for web app calls.

### `services/metrics`

Bun + Fastify HTTP API for vpn-server metrics ingestion.

**Deployment Options:**

1. **AWS Lambda + API Gateway** (production)
2. **Docker container** (self-hosted)
3. **Direct execution** (development)

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

### Control Plane & Metrics (Lambda)

Deployed as AWS Lambda functions with API Gateway:

- Docker images built and pushed to ECR
- Uses Fastify's `inject()` method for Lambda compatibility
- Same code runs locally as standalone servers

### Control Plane & Metrics (Self-hosted)

Can also be deployed as containers:

- Docker images available via Dockerfile
- Requires PostgreSQL database access
- Environment variables for configuration

### VPN Server

Deployed via Pulumi to AWS using `VpnStaticPool`:

- ECR repository for Docker images
- EC2 instances with Elastic IPs (stable public addresses)
- Security groups for VPN protocols:
  - WireGuard (UDP 51820)
  - OpenVPN (UDP 1194)
  - IKEv2/IPsec (UDP 500, 4500)
- User data script configures NAT/masquerading for VPN client internet access

Pulumi reads `controlPlaneApiUrl` from global stack to connect VPN nodes to the control plane.

### Desktop App

Built and distributed via S3:

- Multi-platform builds (macOS, Linux, Windows)
- Automated builds via GitHub Actions
- Download links on web app landing page

### Multi-Environment Support

The same containers can run on:

- AWS (EC2, ECS, EKS, Lambda)
- Kubernetes
- Docker Compose (local development)
- On-premises servers

No AWS-specific services are required for the control plane or metrics services.

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Web App  │   │  Desktop  │   │ WireGuard │
            │ (Vercel)  │   │  (Tauri)  │   │  Client   │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Control  │   │  Metrics  │   │    NLB    │
            │   Plane   │   │  Service  │   │           │
            │ (Lambda)  │   │ (Lambda)  │   │           │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                            ┌───────▼───────┐
                            │   PostgreSQL  │
                            │    (Neon)     │
                            └───────────────┘
                                    ▲
                                    │
                            ┌───────┴───────┐
                            │  VPN Servers  │
                            │  (EC2 ASG)    │
                            └───────────────┘
```

## Security Model

### Authentication Layers

1. **Web App:** NextAuth.js with OAuth providers and magic links
2. **Control Plane (Web):** API key in `x-api-key` header
3. **Control Plane (VPN):** Bearer token for node registration
4. **VPN Protocol:** WireGuard/OpenVPN encryption

### Data Protection

- No traffic logging on VPN nodes
- Minimal metadata collection (session counts, public keys)
- End-to-end encryption for all VPN traffic
- TLS for all API communication
