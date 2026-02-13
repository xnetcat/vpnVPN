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
- [x] Desktop download links with S3 integration
- [x] Advanced usage analytics dashboard (tier breakdown, geographic distribution, historical trends)

### Control Plane (`services/control-plane`)

- [x] Bun/Fastify HTTP API
- [x] Postgres database via Prisma
- [x] Server registration and peer sync endpoints
- [x] Token-based VPN node authentication
- [x] API key authentication for web app calls
- [x] Lambda-compatible deployment (dual-mode: Lambda + standalone)
- [x] Rate limiting on all endpoints (per-IP and per-token)

### Metrics Service (`services/metrics`)

- [x] Bun/Fastify HTTP API
- [x] Postgres database via Prisma
- [x] VPN server metrics ingestion
- [x] Lambda-compatible deployment (dual-mode: Lambda + standalone)

### VPN Server (`apps/vpn-server`)

- [x] Rust binary with WireGuard, OpenVPN, IKEv2 support
- [x] Self-registration with control plane
- [x] Peer sync loop
- [x] Admin API endpoints
- [x] Metrics reporting

### Desktop App (`apps/desktop`)

- [x] Tauri desktop shell with React frontend
- [x] Environment-specific builds (staging/production)
- [x] Deep link support (vpnvpn:// protocol)
- [x] Multi-platform builds (macOS, Linux, Windows)

### Infrastructure (`infra/pulumi`)

- [x] ECR repository for vpn-server images
- [x] EC2 Auto Scaling Group with NLB
- [x] VPC with public/private subnets
- [x] Target-tracking autoscaling
- [x] Observability (AMP/Grafana)
- [x] S3 bucket for desktop releases
- [x] Lambda + API Gateway for control-plane
- [x] Lambda + API Gateway for metrics service
- [x] Multi-region VPN deployment (10 production regions)

### CI/CD (`.github/workflows`)

- [x] CI workflow (lint, test, build)
- [x] Rust build and push to ECR
- [x] Pulumi deployment (global + regional)
- [x] Services deployment (Lambda)
- [x] Desktop build and S3 upload
- [x] CrossGuard policy tests

### Documentation

- [x] CI/CD documentation (`docs/CI_CD.md`)
- [x] Architecture overview (`docs/ARCHITECTURE.md`)
- [x] API contract documentation (`docs/API_REFERENCE.md`)
- [x] Secrets management guide (`docs/SECRETS_MANAGEMENT.md`)
- [x] VPN node deployment runbook (`docs/VPN_NODE_RUNBOOK.md`)
- [x] Troubleshooting guide (`docs/TROUBLESHOOTING.md`)
- [x] Production setup guide (`docs/PRODUCTION_SETUP.md`)
- [x] Backup and disaster recovery (`docs/BACKUP_RECOVERY.md`)
- [x] Certificate rotation guide (`docs/CERTIFICATE_ROTATION.md`)

---

## Pending Tasks

### Testing & Validation

- [ ] End-to-end production flow test (signup → payment → VPN connection)

### Feature Development

- [ ] Proxy support (SOCKS5/HTTP proxy servers)
- [ ] VPN node deployment from admin dashboard (integrate existing `deploy.sh` script)

---

## Completed (Production)

### Production Deployment

- [x] Configure production Stripe webhooks
- [x] Set up production Resend sender domain
- [x] Create production VPN node tokens
- [x] SSL certificates for custom domains
- [x] Multi-region VPN deployment (10 production regions)

---

## Quick Reference

### API Endpoints

#### Control Plane (`services/control-plane`)

| Endpoint                 | Method | Auth         | Rate Limit | Description              |
| ------------------------ | ------ | ------------ | ---------- | ------------------------ |
| `/health`                | GET    | None         | 300/min    | Health check             |
| `/server/register`       | POST   | Bearer token | 20/min     | VPN node registration    |
| `/server/peers`          | GET    | Bearer token | 100/min    | Fetch peers for a server |
| `/servers`               | GET    | API key      | 100/min    | List all servers         |
| `/servers/:id`           | DELETE | API key      | 30/min     | Delete a server          |
| `/peers`                 | POST   | API key      | 30/min     | Create/update peer       |
| `/peers/revoke-for-user` | POST   | API key      | 30/min     | Revoke user's peers      |
| `/peers/:publicKey`      | DELETE | API key      | 30/min     | Revoke specific peer     |
| `/tokens`                | GET    | API key      | 100/min    | List all tokens          |
| `/tokens`                | POST   | API key      | 30/min     | Create new token         |
| `/tokens/:token`         | DELETE | API key      | 30/min     | Revoke a token           |

#### Metrics (`services/metrics`)

| Endpoint       | Method | Description               |
| -------------- | ------ | ------------------------- |
| `/health`      | GET    | Health check              |
| `/metrics/vpn` | POST   | Ingest VPN server metrics |

### Documentation Index

| Document                       | Description                        |
| ------------------------------ | ---------------------------------- |
| `docs/ARCHITECTURE.md`         | System architecture overview       |
| `docs/CI_CD.md`                | CI/CD workflows and deployment     |
| `docs/API_REFERENCE.md`        | Complete API documentation         |
| `docs/PRODUCTION_SETUP.md`     | Production configuration guide     |
| `docs/SECRETS_MANAGEMENT.md`   | Secrets and credentials management |
| `docs/VPN_NODE_RUNBOOK.md`     | VPN node deployment and operations |
| `docs/TROUBLESHOOTING.md`      | Common issues and solutions        |
| `docs/BACKUP_RECOVERY.md`      | Backup and disaster recovery       |
| `docs/CERTIFICATE_ROTATION.md` | Certificate and key rotation       |

### VPN Regions (Production)

| Region         | Location                  | Nodes |
| -------------- | ------------------------- | ----- |
| us-east-1      | US East (N. Virginia)     | 3     |
| us-west-2      | US West (Oregon)          | 2     |
| ca-central-1   | Canada (Montreal)         | 1     |
| eu-west-1      | Europe (Ireland)          | 2     |
| eu-central-1   | Europe (Frankfurt)        | 2     |
| eu-north-1     | Europe (Stockholm)        | 1     |
| ap-southeast-1 | Asia Pacific (Singapore)  | 2     |
| ap-northeast-1 | Asia Pacific (Tokyo)      | 2     |
| ap-south-1     | Asia Pacific (Mumbai)     | 1     |
| sa-east-1      | South America (São Paulo) | 1     |

### Environment Variables

See `env.example` and `apps/web/env.local.example` for required configuration.

### Deployment Commands

```bash
# Full deployment to staging
./scripts/deploy.sh staging

# Full deployment to production
./scripts/deploy.sh production

# Deploy services only (Lambda)
cd infra/pulumi && pulumi up --stack global

# Deploy VPN nodes only
cd infra/pulumi && pulumi up --stack region-us-east-1
```
