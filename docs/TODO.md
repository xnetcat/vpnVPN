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

### Control Plane (`services/control-plane`)

- [x] Bun/Fastify HTTP API
- [x] Postgres database via Prisma
- [x] Server registration and peer sync endpoints
- [x] Token-based VPN node authentication
- [x] API key authentication for web app calls

### VPN Server (`apps/vpn-server`)

- [x] Rust binary with WireGuard, OpenVPN, IKEv2 support
- [x] Self-registration with control plane
- [x] Peer sync loop
- [x] Admin API endpoints
- [x] Metrics reporting

### Infrastructure (`infra/pulumi`)

- [x] ECR repository for vpn-server images
- [x] EC2 Auto Scaling Group with NLB
- [x] VPC with public/private subnets
- [x] Target-tracking autoscaling
- [x] Observability (AMP/Grafana)

---

## Pending Tasks

### Production Readiness

- [ ] Configure production Stripe webhooks
- [ ] Set up production Resend sender domain
- [ ] Deploy control-plane and metrics services
- [ ] Create production VPN node tokens
- [ ] End-to-end production flow test

### Documentation

- [ ] API contract documentation for all endpoints
- [ ] Secrets management guide (Vercel, AWS)
- [ ] VPN node deployment runbook
- [ ] Troubleshooting guide

### Optional Enhancements

- [ ] Additional VPN regions
- [ ] Usage analytics dashboard
- [ ] Rate limiting on control-plane endpoints
- [ ] Backup and disaster recovery procedures

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

See `apps/web/env.local.example` and `infra/pulumi/env.example` for required configuration.
