# Task Board & Roadmap

**Status Legend:**

- [ ] Pending
- [/] In Progress
- [x] Completed

---

## Completed Features

### SaaS Frontend (`apps/web`)

- [x] Next.js 15 with App Router and tRPC v11
- [x] NextAuth.js authentication (GitHub, Google, Email magic link)
- [x] Stripe subscriptions with multi-tier pricing (Basic, Pro, Enterprise)
- [x] Resend email notifications (welcome, subscription, device alerts)
- [x] Device management with tier-based limits
- [x] Server selection and status display
- [x] Admin panel (token management, fleet monitoring, server provisioning)
- [x] Dashboard with real metrics from control plane
- [x] Desktop download links (GitHub Releases)
- [x] Advanced usage analytics dashboard

### Control Plane (`services/control-plane`)

- [x] Bun/Fastify HTTP API
- [x] Postgres database via Prisma
- [x] Server registration and peer sync endpoints
- [x] Token-based VPN node authentication
- [x] API key authentication for web app calls
- [x] Metrics ingestion endpoint (`POST /metrics/vpn`)
- [x] Railway deployment (Docker, auto-deploy from GitHub)

### VPN Server (`apps/vpn-server`)

- [x] Rust binary with WireGuard, OpenVPN, IKEv2 support
- [x] Self-registration with control plane
- [x] Peer sync loop
- [x] Admin API endpoints
- [x] Metrics reporting
- [x] Shared PKI for OpenVPN and IKEv2
- [x] IKEv2 EAP-MSCHAPv2 authentication
- [x] IKEv2 peer management (apply_peers)
- [x] OpenVPN tls-crypt support
- [x] OpenVPN hashed credential verification
- [x] OpenVPN dropped privileges (nobody/nogroup)
- [x] WireGuard PersistentKeepalive
- [x] WireGuard MTU 1420
- [x] WireGuard IPv6 support

### Desktop App (`apps/desktop`)

- [x] Tauri desktop shell with React frontend
- [x] Environment-specific builds (staging/production)
- [x] Deep link support (vpnvpn:// protocol)
- [x] Multi-platform builds (macOS, Linux, Windows)

### Infrastructure

- [x] Railway deployment for control plane
- [x] GHCR for VPN server Docker images
- [x] GitHub Releases for desktop app distribution
- [x] Manual VPN node provisioning script

### CI/CD (`.github/workflows`)

- [x] CI workflow (lint, test, build)
- [x] VPN server build and push to GHCR
- [x] Desktop build and GitHub Releases upload
- [x] E2E test workflow

### Testing

- [x] E2E test infrastructure (Docker-based)
- [x] WireGuard connectivity E2E test
- [x] OpenVPN connectivity E2E test
- [x] IKEv2 connectivity E2E test
- [x] Peer revocation E2E test
- [x] Reconnection E2E test

### Documentation

- [x] Architecture overview (`docs/ARCHITECTURE.md`)
- [x] Deployment guide (`docs/DEPLOYMENT.md`)
- [x] Configuration guide (`docs/CONFIGURATION.md`)
- [x] API documentation (`docs/API.md`)

---

## Pending Tasks

### Testing & Validation

- [ ] End-to-end production flow test (signup -> payment -> VPN connection)
- [ ] Control plane unit tests (server registration, peer CRUD, token management)
- [ ] VPN server unit tests (config generation, status parsing, PKI)

### Feature Development

- [ ] Proxy support (SOCKS5/HTTP proxy servers)
- [ ] Grafana Cloud dashboards (node health, protocol distribution)

---

## Quick Reference

### API Endpoints

#### Control Plane (`services/control-plane`)

| Endpoint                 | Method | Auth         | Description              |
| ------------------------ | ------ | ------------ | ------------------------ |
| `/health`                | GET    | None         | Health check             |
| `/server/register`       | POST   | Bearer token | VPN node registration    |
| `/server/peers`          | GET    | Bearer token | Fetch peers for a server |
| `/servers`               | GET    | API key      | List all servers         |
| `/servers/:id`           | DELETE | API key      | Delete a server          |
| `/peers`                 | POST   | API key      | Create/update peer       |
| `/peers/revoke-for-user` | POST   | API key      | Revoke user's peers      |
| `/peers/:publicKey`      | DELETE | API key      | Revoke specific peer     |
| `/tokens`                | GET    | API key      | List all tokens          |
| `/tokens`                | POST   | API key      | Create new token         |
| `/tokens/:token`         | DELETE | API key      | Revoke a token           |
| `/metrics/vpn`           | POST   | None         | Ingest VPN metrics       |

### Environment Variables

See `env.example` for required configuration.

### Deployment Commands

```bash
# Local development
bun run dev

# Build VPN server image
cd apps/vpn-server && docker build -t vpn-server .

# Run E2E tests
cd e2e && bash run-e2e.sh

# Provision a new VPN node
sudo -E bash scripts/setup-vpn-node.sh
```
