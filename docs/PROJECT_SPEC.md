## vpnVPN — Project Documentation and Specification

### 1. Executive summary

vpnVPN is a VPN SaaS built on AWS and Vercel. It provides a Rust-based VPN data plane deployed on EC2 with autoscaling behind an NLB, a control plane on AWS (API Gateway + Lambda + DynamoDB), and an admin dashboard on Vercel (Next.js + TypeScript). Infrastructure is fully expressed as code with Pulumi (TypeScript). CI/CD uses GitHub Actions to build images and deploy infra.

### 2. Scope and goals

- End users: consumers, SMBs, enterprise; provide desktop/mobile/CLI clients over time.
- Protocols: modern secure protocols (WireGuard, OpenVPN, IKEv2) planned; server scaffold is ready for TUN/TAP and metrics.
- Regions: user-selectable; multi-region via per-region Pulumi stacks.
- Billing/auth: subscriptions (Stripe), trials, usage metering; auth via email/password, OAuth, SSO (subsequent phases).
- Admin: dashboard with server list, proxy pool, and resource monitoring.
- Cloud: AWS backend only; Vercel for the admin UI.

### 3. Architecture overview

- Admin UI (Vercel): Next.js App Router, TailwindCSS.
- Control plane (AWS):
  - API: API Gateway HTTP + Lambda for endpoints like GET /proxies.
  - Proxy pool: EventBridge schedule → Lambda scraper → DynamoDB table.
  - Observability: AMP (Prometheus) and AMG (Grafana).
- Data plane (AWS):
  - EC2 Auto Scaling Group running the Rust VPN server container with TUN/TAP.
  - Network Load Balancer (NLB) exposes UDP 51820 (VPN) and TCP 8080 (admin/metrics).
  - Security groups allow minimal ports; SSM Session Manager for access.
- IaC: Pulumi TypeScript for all resources.
- CI/CD: GitHub Actions builds Rust Docker image to ECR and deploys with Pulumi (OIDC auth).

### 4. Data plane — Rust VPN server

- Runtime: Docker on Amazon Linux 2 EC2 instances; started via cloud-init UserData.
- Listeners: UDP 51820 (VPN stub), TCP 51820 (stub), admin HTTP on 8080.
- Admin endpoints: `/health` (200 OK), `/metrics` (Prometheus text format).
- Privileges: `NET_ADMIN`, `/dev/net/tun` device mapped; host networking; NLB forwards traffic.
- Scaling: target-tracking on custom `ActiveSessions` CloudWatch metric emitted per node (dimension: ASG, Instance). Override target via `region:targetSessionsPerInstance` Pulumi config.
- Future protocol work: integrate WireGuard/IKEv2/OpenVPN with X25519 handshakes and AEAD (ChaCha20-Poly1305/AES-GCM).

### 5. Control plane — APIs and proxy pipeline

- API endpoints (HTTP API):
  - GET `/proxies`: returns top proxy candidates from DynamoDB.
  - GET `/health`: reserved for status.
- Proxy scraper:
  - EventBridge `rate(30 minutes)` → Lambda fetches lists, parses and writes batch records into DynamoDB with simple scoring fields.
  - Extendable to latency checks/anonymity scoring.

### 6. Infrastructure as Code (Pulumi)

- Global stack:
  - ECR repository for Rust server images.
  - Control plane: HTTP API + Lambdas + DynamoDB + EventBridge schedule.
  - Observability: AMP + AMG workspaces.
- Region stack:
  - `vpnAsg` component: VPC (2 AZs), private subnets for EC2, public subnets for NLB.
  - Security groups; NLB with UDP 51820 and TCP 8080 listeners.
  - EC2 Launch Template with cloud-init to pull ECR image and run container.
  - ASG with target-tracking scaling policy (CPU 40%).

### 7. Autoscaling and load balancing

- NLB distributes UDP and TCP to instances (instance target mode).
- ASG scales on custom `ActiveSessions` CloudWatch metric published by each node (dimension: `AutoScalingGroupName`), with default target 120 sessions per instance.
- Session stickiness is handled via NLB’s UDP/TCP forwarding; clients reconnect as needed.

### 8. Proxy scraping and obfuscation

- Built-in scraper (Lambda) populates DynamoDB with proxy candidates.
- Admin can view proxies (UI page). Future: allow enable/disable sources, blacklisting.
- Obfuscation transport roadmap: TLS-wrapping, udp2raw, obfs4; optional pre/post-VPN hops.

### 9. Security and key management

- EC2 instance role with least privilege (ECR read-only, SSM Core, CloudWatch agent policy).
- No public SSH; use SSM Session Manager.
- Image scanning on push.
- Secrets in AWS Secrets Manager + KMS; Pulumi references ARNs (no plaintext secrets).

### 10. Data model

- DynamoDB `proxies` table:
  - PK: `proxyId` (S)
  - Attributes: `type`, `ip`, `port`, `country`, `latency`, `score`, `lastValidated`.

### 11. Observability and alerting

- Rust server exposes Prometheus metrics at `/metrics` (e.g., sessions, bytes).
- CloudWatch publisher emits `ActiveSessions` and `BytesSent` each minute for autoscaling and dashboards.
- AMP workspace for ingestion; AMG workspace for dashboards.
- CloudWatch Logs for Lambda/API Gateway; Event logs for scraper.
- Future alerts: node crash/restart, 5xx spikes, scaling anomalies.

### 12. Admin dashboard (Next.js on Vercel)

- Pages:
  - Dashboard: overall status cards (placeholder values now).
  - Servers: list of nodes (mocked for now; wire to control plane later).
  - Proxies: fetch from control-plane `/proxies` using `NEXT_PUBLIC_API_BASE_URL`.
- Styling: Tailwind; accessible markup; responsive grid for cards/tables.

### 13. Billing, auth and entitlements (roadmap)

- Billing: Stripe (subscriptions, trials, usage metering via usage records).
- Auth: email/password, OAuth providers, SSO (SAML/OIDC) for admin.
- Entitlements: plan-based policy enforcement in control plane when issuing configs.

### 14. Testing and local development

- Local AWS: LocalStack via `local/compose.yaml` for control-plane (DynamoDB, API GW, Lambda, etc.).
  - Limitation: EC2/NLB not supported in LocalStack community; data plane testing requires real AWS.
- Admin UI: `cd admin-ui && pnpm i && pnpm dev`; set `NEXT_PUBLIC_API_BASE_URL`.
- Rust server: `cd vpn-server && cargo build --release --target x86_64-unknown-linux-musl`.
- Infra: `cd infra/pulumi && npm i && pulumi login` then `pulumi up -s global` and `pulumi up -s region-us-east-1`.

### 15. CI/CD

- Workflow 1: Build and push Rust server image to ECR, tag `sha-<commit>` (OIDC role).
- Workflow 2: Pulumi deploy global then region stack; sets `region:imageTag` to the commit SHA tag.
- Rollouts: new ASG instances pull the new tag; old instances drain via NLB as they terminate.

### 16. Runbooks

- Replace/upgrade nodes: push new commit → CI builds → deploy region stack with new tag.
- Node degraded: increase desired count; terminate unhealthy instance after replacement is healthy.
- Proxy pool stale: check scraper logs; trigger Lambda manually; adjust sources.

### 17. Compliance and privacy (initial posture)

- Data minimization: avoid PII in logs; short retention for operational logs.
- Path to SOC2/GDPR readiness via audit logs, access control, data retention policies.

### 18. Environments and configuration

- Pulumi stacks:
  - `global`: ECR, control plane, observability.
  - `region-us-east-1`: VPC, NLB, EC2 ASG.
- Config keys (examples):
  - `global:ecrRepoName = vpnvpn/rust-server`
  - `region:imageTag = sha-<commit>`
  - `region:minInstances = 1`, `region:maxInstances = 3`
  - `region:instanceType = t3.medium`
  - `region:adminCidr = 0.0.0.0/0` (tighten to office/VPN ranges in prod)

### 19. Getting started

1. CI secrets: set `AWS_REGION`, `AWS_ACCOUNT_ID`, `AWS_ROLE_TO_ASSUME`, `PULUMI_ACCESS_TOKEN`, optional `ECR_REPO_NAME`.
2. First deploy:
   - Global: `cd infra/pulumi && npm i && pulumi up -s global`.
   - Build and push the image (push to main or run the workflow).
   - Region: `pulumi config set region:imageTag sha-<commit> -s region-us-east-1 && pulumi up -s region-us-east-1`.
3. Admin UI: `cd admin-ui && pnpm i && pnpm dev`; set `NEXT_PUBLIC_API_BASE_URL` to Pulumi `apiUrl` output.
4. Local metrics: set `DISABLE_CLOUDWATCH_METRICS=1` when running the Rust server outside AWS to avoid publishing attempts.

### 20. VPS support (optional)

- The Rust server container can run on third-party VPS: install Docker, create `/dev/net/tun`, run with `--cap-add=NET_ADMIN --device /dev/net/tun --network host`, map ports 51820/udp and 8080/tcp. You will not have autoscaling/NLB; use DNS + health checks external to AWS.

### 21. Roadmap next steps

- Protocol integration (WireGuard/IKEv2/OpenVPN) and client distro configs.
- Custom CloudWatch metric (`ActiveSessions`) and scaling based on it.
- AuthN/AuthZ integration for admin UI; Stripe for billing.
- Multi-region scaling and routing (Route53 latency-based, Global Accelerator optional).
