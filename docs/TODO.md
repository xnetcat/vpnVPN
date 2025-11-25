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

### Control Plane (`services/control-plane`)

- [x] Bun/Fastify HTTP API
- [x] Postgres database via Prisma
- [x] Server registration and peer sync endpoints
- [x] Token-based VPN node authentication
- [x] API key authentication for web app calls
- [x] Lambda-compatible deployment (dual-mode: Lambda + standalone)

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

### CI/CD (`.github/workflows`)

- [x] CI workflow (lint, test, build)
- [x] Rust build and push to ECR
- [x] Pulumi deployment (global + regional)
- [x] Services deployment (Lambda)
- [x] Desktop build and S3 upload
- [x] CrossGuard policy tests

---

## Pending Tasks

### Production Readiness

- [ ] Configure production Stripe webhooks
- [ ] Set up production Resend sender domain
- [ ] Create production VPN node tokens
- [ ] End-to-end production flow test
- [ ] SSL certificates for custom domains

### Documentation

- [x] CI/CD documentation
- [x] Architecture overview
- [ ] API contract documentation for all endpoints
- [ ] Secrets management guide (Vercel, AWS)
- [ ] VPN node deployment runbook
- [ ] Troubleshooting guide

### Optional Enhancements

- [ ] Additional VPN regions
- [ ] Usage analytics dashboard
- [ ] Rate limiting on control-plane endpoints
- [ ] Backup and disaster recovery procedures
- [ ] Automated certificate rotation

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
| `/peers`                 | POST   | API key      | Create/update peer       |
| `/peers/revoke-for-user` | POST   | API key      | Revoke user's peers      |
| `/peers/:publicKey`      | DELETE | API key      | Revoke specific peer     |

#### Metrics (`services/metrics`)

| Endpoint       | Method | Description               |
| -------------- | ------ | ------------------------- |
| `/health`      | GET    | Health check              |
| `/metrics/vpn` | POST   | Ingest VPN server metrics |

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
