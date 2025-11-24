## CI/CD Overview

vpnVPN uses GitHub Actions plus Bun/Turborepo and Pulumi to build, test and deploy
the monorepo.

### Workflows

- `.github/workflows/ci.yml`
  - Triggers on pushes and pull requests to `main`.
  - Steps:
    - Checkout repository.
    - Setup Bun (`oven-sh/setup-bun@v1`).
    - `bun install` at the monorepo root.
    - `bun run lint` → `turbo run lint`.
    - `bun run test` → `turbo run test`.
    - `bun run build` → `turbo run build`.
  - Scope:
    - Apps: `apps/web`, `apps/desktop`, `apps/vpn-server`.
    - Services: `services/control-plane`, `services/metrics`.
    - Shared packages: `packages/db`.

- `.github/workflows/rust-build-push.yml`
  - Name: **Build and Push Rust Server**.
  - Triggers on pushes to `main` that touch `apps/vpn-server/**` or the workflow file.
  - Uses OIDC to assume an AWS role and log into ECR.
  - Builds the `apps/vpn-server` Docker image and tags it as:
    - `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:sha-${GITHUB_SHA}`
  - Pushes the image to ECR and exposes:
    - `IMAGE_TAG`
    - `ECR_URI`
  - This image is consumed by the Pulumi `region-*` stacks for the vpn-server ASG.

- `.github/workflows/pulumi-deploy.yml`
  - Name: **Pulumi Deploy (Global + Region)**.
  - Triggers:
    - On completion of **Build and Push Rust Server**.
    - Manual `workflow_dispatch`.
  - Environment:
    - `AWS_REGION`, `AWS_ACCOUNT_ID`, `PULUMI_ACCESS_TOKEN`,
      `ECR_REPO_NAME`, `AWS_ROLE_TO_ASSUME`, `CONTROL_PLANE_API_URL` (secrets).
  - Steps:
    - Checkout repository.
    - Configure AWS credentials via OIDC.
    - Setup Node.js 20 and Bun.
    - `bun install` in `infra/pulumi`.
    - `pulumi login`.
    - Ensure `global` and `region-us-east-1` stacks exist.
    - Configure stacks:
      - `aws:region` and `global:ecrRepoName` for both stacks.
      - `controlPlaneApiUrl` for `global` (from `CONTROL_PLANE_API_URL` secret).
      - `region:imageTag` and sizing config (`minInstances`, `maxInstances`,
        `instanceCpu`, `instanceMemory`, `adminCidr`, `targetSessionsPerInstance`)
        for `region-us-east-1`.
    - Run `pulumi up -y` for `global` and `region-us-east-1`.

### Responsibilities by layer

- **CI (lint, test, build)**:
  - Ensures all TS/Rust code compiles, lints cleanly, and passes tests across the monorepo.
  - Uses Turborepo caching to keep runs fast.

- **Image build (Rust vpn-server)**:
  - Produces a versioned Docker image for the vpn-server data-plane.
  - Does not deploy; it only pushes to ECR.

- **Infra deploy (Pulumi)**:
  - Provisions/updates:
    - ECR repository for vpn-server.
    - VPC, NLB, security groups and ASG for running the vpn-server containers.
    - AMP/Grafana for observability.
  - Treats the control-plane and metrics services as external HTTP endpoints
    (configured via `controlPlaneApiUrl`), not AWS Lambdas.


