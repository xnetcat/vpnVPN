# CI/CD Overview

vpnVPN uses GitHub Actions, Bun/Turborepo, and Pulumi to build, test, and deploy the monorepo.

## Workflows

### `.github/workflows/ci.yml`

**Triggers:** Pushes and pull requests to `main` and `staging` branches.

**Steps:**

1. Checkout repository
2. Setup Bun (`oven-sh/setup-bun@v1`)
3. `bun install` at the monorepo root
4. `bun run lint` → `turbo run lint`
5. `bun run test` → `turbo run test`
6. `bun run build` → `turbo run build`

**Scope:**

- Apps: `apps/web`, `apps/desktop`, `apps/vpn-server`
- Services: `services/control-plane`, `services/metrics`
- Shared packages: `packages/db`

### `.github/workflows/rust-build-push.yml`

**Name:** Build and Push Rust Server

**Triggers:** Pushes to `main` that touch `apps/vpn-server/**` or the workflow file itself.

**Steps:**

1. Configure AWS credentials via OIDC
2. Login to Amazon ECR
3. Build the `apps/vpn-server` Docker image
4. Tag as `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:sha-${GITHUB_SHA}`
5. Push the image to ECR

**Outputs:** `IMAGE_TAG`, `ECR_URI`

### `.github/workflows/pulumi-deploy.yml`

**Name:** Pulumi Deploy (Global + Region)

**Triggers:**

- On completion of "Build and Push Rust Server" workflow
- Manual `workflow_dispatch`

**Environment Variables (from secrets):**

- `AWS_REGION`, `AWS_ACCOUNT_ID`
- `PULUMI_ACCESS_TOKEN`
- `ECR_REPO_NAME`, `AWS_ROLE_TO_ASSUME`
- `CONTROL_PLANE_API_URL`

**Steps:**

1. Checkout repository
2. Configure AWS credentials via OIDC
3. Setup Node.js 20 and Bun
4. `bun install` in `infra/pulumi`
5. `pulumi login`
6. Ensure `global` and `region-us-east-1` stacks exist
7. Configure and deploy `global` stack (ECR repo, control-plane URL, observability)
8. Configure and deploy `region-us-east-1` stack (VPC, NLB, ASG with vpn-server containers)

## Architecture

### Services

| Component | Implementation | Deployment |
| --------- | -------------- | ---------- |
| Control Plane | `services/control-plane` (Bun/Fastify + Postgres) | Container (ECS, EC2, K8s, etc.) |
| Metrics | `services/metrics` (Bun/Fastify + Postgres) | Container |
| VPN Server | `apps/vpn-server` (Rust) | Container on EC2 ASG via Pulumi |
| Web App | `apps/web` (Next.js) | Vercel |
| Desktop | `apps/desktop` (Tauri) | Local builds |

### Pulumi Stacks

- **`global`**: ECR repository, control-plane URL config, observability (AMP/Grafana)
- **`region-*`**: VPC, NLB, security groups, EC2 ASG running vpn-server containers

## Responsibilities by Layer

### CI (lint, test, build)

- Ensures all TS/Rust code compiles, lints cleanly, and passes tests
- Uses Turborepo caching to keep runs fast

### Image Build (Rust vpn-server)

- Produces a versioned Docker image for the vpn-server data-plane
- Does not deploy; only pushes to ECR

### Infra Deploy (Pulumi)

Provisions and updates:

- ECR repository for vpn-server
- VPC, NLB, security groups, and ASG for running vpn-server containers
- AMP/Grafana for observability
- Reads the control-plane URL from config (does not provision the control-plane service itself)

## Required GitHub Secrets

| Secret | Description |
| ------ | ----------- |
| `AWS_REGION` | AWS region (e.g., `us-east-1`) |
| `AWS_ACCOUNT_ID` | AWS account ID |
| `AWS_ROLE_TO_ASSUME` | IAM role ARN for OIDC authentication |
| `PULUMI_ACCESS_TOKEN` | Pulumi access token for state management |
| `ECR_REPO_NAME` | ECR repository name (e.g., `vpnvpn/rust-server`) |
| `CONTROL_PLANE_API_URL` | URL of the deployed control-plane service |

## Optional GitHub Variables

Set these in GitHub repository variables to control VPN node deployment:

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `VPN_DESIRED_INSTANCES` | Number of VPN nodes to deploy | 2 |
| `VPN_MIN_INSTANCES` | Minimum nodes (autoscaling floor) | 1 |
| `VPN_MAX_INSTANCES` | Maximum nodes (autoscaling ceiling) | 10 |

## Node Distribution Configuration

The number of VPN nodes and regional distribution is controlled by Pulumi stack configuration:

| Config Key                | Description                                    | Default |
| ------------------------- | ---------------------------------------------- | ------- |
| `region:desiredInstances` | Number of VPN nodes to deploy in this region   | minInstances |
| `region:minInstances`     | Minimum nodes (autoscaling floor)              | 1 |
| `region:maxInstances`     | Maximum nodes (autoscaling ceiling)            | 10 |

### Example: Multi-Region Deployment

```bash
# US East - 4 nodes
pulumi stack select region-us-east-1
pulumi config set region:desiredInstances 4
pulumi up -y

# EU West - 3 nodes
pulumi stack select region-eu-west-1
pulumi config set region:desiredInstances 3
pulumi up -y
```

## Manual Deployment

### Using the Deployment Script

The recommended way to deploy is using the deployment script:

```bash
# From project root - deploy to staging
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production

# Options
./scripts/deploy.sh staging --skip-desktop    # Skip desktop app build
./scripts/deploy.sh staging --skip-vpn-nodes  # Skip VPN node deployment
```

The script:
1. Loads environment variables from root `.env`
2. Deploys global Pulumi stack to us-east-1 (ECR, S3, observability)
3. Builds and pushes vpn-server Docker image
4. Deploys VPN nodes to regions defined in `scripts/regions.json`
5. Builds desktop apps with hardcoded API endpoints
6. Uploads desktop executables to S3

### Region Configuration

Edit `scripts/regions.json` to configure VPN node distribution:

```json
{
  "staging": [
    {"region": "us-east-1", "nodes": 1, "min": 1, "max": 3}
  ],
  "production": [
    {"region": "us-east-1", "nodes": 3, "min": 2, "max": 10},
    {"region": "eu-west-1", "nodes": 2, "min": 1, "max": 8},
    {"region": "ap-southeast-1", "nodes": 1, "min": 1, "max": 5}
  ]
}
```

### Manual Pulumi Commands

For detailed manual Pulumi deployment instructions, see `infra/README.md`.
