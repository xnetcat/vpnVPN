vpnVPN monorepo

This repository contains:

- `web-app`: Full SaaS frontend (Next.js + TypeScript + Tailwind) for marketing site, user dashboard, and admin panel.
- `infra/pulumi`: Infrastructure as Code (Pulumi TypeScript) for the AWS control plane, observability, and regional data-plane capacity.
- `vpn-server`: Rust VPN node agent that manages WireGuard, OpenVPN, and IKEv2 on host machines (EC2, VPS, bare metal, desktop OSes).
- `local`: Local development and end-to-end test stack.
- `.github/workflows`: CI/CD pipelines (build/test, image publish, Pulumi deploy).

Getting started instructions are in each subdirectory's README.

Environment & configuration

- **web-app**
  - Copy `web-app/env.local.example` to `web-app/.env.local` for local development only.
  - In production, configure all variables via Vercel project settings (no `.env` files in git).
- **vpn-server**
  - Prefer CLI flags for configuration (e.g. `vpn-server run --api-url ... --token ...`).
  - Environment variables are supported as a convenience but `.env` files are not required.
- **infra/pulumi**
  - Set configs via `pulumi config`; optionally copy `infra/pulumi/env.example` to a local `.env` for your shell.

Local AWS (control plane)

- `docker compose -f local/compose.yaml up -d` to start Postgres, LocalStack, web-app, and a vpn-server node.
- Use LocalStack to run control-plane subsystems (DynamoDB/Lambda/API GW) locally; EC2/NLB are exercised against real AWS in integration environments.

Pulumi region configs to set before `pulumi up -s region-...`:

- `region:imageTag`
- `region:minInstances` / `region:maxInstances`
- `region:instanceType`
- `region:adminCidr`
- `region:targetSessionsPerInstance`
