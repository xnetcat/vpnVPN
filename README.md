vpnVPN monorepo

This repository contains:

- `infra/pulumi`: Infrastructure as Code (Pulumi TypeScript) for AWS in us-east-1 (global control plane + per-region EC2 ASG data plane)
- `vpn-server`: Rust VPN data-plane server (tokio-based) with health/metrics
- `admin-ui`: Next.js admin dashboard (TypeScript + Tailwind)
- `.github/workflows`: CI/CD pipelines (build/push to ECR, Pulumi deploy)

Getting started instructions are in each subdirectory's README.

Environment files

- Copy `admin-ui/env.local.example` to `admin-ui/.env.local` and adjust.
- Copy `vpn-server/env.example` to `vpn-server/.env` and adjust.
- For Pulumi, set configs via `pulumi config`; optionally copy `infra/pulumi/env.example` to a local `.env` for your shell.

Local AWS (LocalStack)

- `docker compose -f local/compose.yaml up -d`
- Note: EC2/NLB not supported on LocalStack community. Use real AWS for data-plane.

Pulumi region configs to set before `pulumi up -s region-...`:

- `region:imageTag`
- `region:minInstances` / `region:maxInstances`
- `region:instanceType`
- `region:adminCidr`
- `region:targetSessionsPerInstance`
