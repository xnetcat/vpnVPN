# Infrastructure (Pulumi TypeScript)

This package defines the AWS compute, networking, and observability stack for vpnVPN's VPN data-plane and services.

## Environments and stacks

We run a single AWS account with separate **Pulumi stacks** for staging and production:

- **Global (control-plane, metrics, shared infra):**
  - Staging: `global-staging`
  - Production: `global-production`
- **Regional VPN nodes:**
  - Staging: `region-us-east-1-staging`, `region-eu-west-1-staging`, ...
  - Production: `region-us-east-1-production`, `region-eu-west-1-production`, ...

Each stack has a corresponding `Pulumi.<stack>.yaml` file (for example `Pulumi.global-staging.yaml`).
These files should be committed, while any secrets are stored via `pulumi config set --secret`.

See `docs/CI_CD.md` for how GitHub Actions selects stacks based on branch (`staging` vs `main`)
and environment (`staging` vs `production`).

## Quick Start

### CI-driven deployment (preferred)

For day-to-day deployments, rely on CI:

- `rust-build-push.yml` builds and pushes the vpn-server image to ECR.
- `services-deploy.yml` deploys control-plane + metrics Lambdas into `global-*`.
- `pulumi-deploy.yml` deploys global infra + VPN node stacks (`global-*`, `region-*`).

See `docs/CI_CD.md` for the full environment matrix and workflow behavior.

### Manual deployment script (infra-focused)

You can also deploy infra from your machine with the helper script:

```bash
# Deploy to staging (from project root)
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production

# Additionally build/upload desktop artifacts from your machine (legacy path)
./scripts/deploy.sh staging --with-desktop
```

The script reads configuration from:

- **Root `.env`** - Environment variables for all services
- **`scripts/regions.json`** - VPN node distribution per region and per environment

> Desktop builds are primarily handled by `.github/workflows/desktop-build.yml`.
> The `--with-desktop` flag is a convenience for local testing.

## Architecture

The vpnVPN infrastructure includes:

1. **Control Plane:** AWS Lambda + API Gateway (or standalone containers)
2. **Metrics Service:** AWS Lambda + API Gateway (or standalone containers)
3. **VPN Nodes:** EC2 Auto Scaling Groups behind Network Load Balancers
4. **Desktop Distribution:** S3 bucket with public access

**Global resources always deploy to us-east-1**, while VPN nodes are distributed across multiple regions.

## Stacks

### Global stacks (`global-staging`, `global-production`)

Global stacks live in `us-east-1` and include:

- ECR repository for `vpn-server` Docker images.
- S3 bucket for desktop app downloads.
- S3 bucket for Lambda deployment packages.
- Control Plane Lambda + API Gateway.
- Metrics Service Lambda + API Gateway.
- Observability resources (Amazon Managed Prometheus, Amazon Managed Grafana).

### Regional stacks (`region-*-staging`, `region-*-production`)

Each regional stack (for example `region-us-east-1-staging`) creates:

- VPC with public/private subnets across 2 availability zones.
- Security groups for VPN protocols (WireGuard 51820/udp, OpenVPN 1194/udp, IKEv2 500+4500/udp) and admin port (8080/tcp).
- Network Load Balancer (NLB) for exposing VPN endpoints.
- EC2 Auto Scaling Group running the `vpn-server` container.
- Target-tracking autoscaling based on `ActiveSessions` CloudWatch metric.

## Configuration Reference

### Global Stack

| Config Key                    | Description                             | Default                     |
| ----------------------------- | --------------------------------------- | --------------------------- |
| `global:ecrRepoName`          | ECR repository name                     | `vpnvpn/rust-server`        |
| `global:desktopBucket`        | S3 bucket for desktop releases          | `vpnvpn-desktop-releases`   |
| `global:codeBucket`           | S3 bucket for Lambda code               | `vpnvpn-lambda-deployments` |
| `global:controlPlaneCodeKey`  | S3 key for control-plane Lambda package | -                           |
| `global:controlPlaneImageUri` | ECR URI for control-plane Docker image  | -                           |
| `global:metricsCodeKey`       | S3 key for metrics Lambda package       | -                           |
| `global:metricsImageUri`      | ECR URI for metrics Docker image        | -                           |
| `databaseUrl` (secret)        | PostgreSQL connection string            | Required                    |
| `controlPlaneApiKey` (secret) | API key for control plane               | Required                    |
| `bootstrapToken` (secret)     | Bootstrap token for VPN nodes           | -                           |

### Region Stack

| Config Key                         | Description                                  | Default              |
| ---------------------------------- | -------------------------------------------- | -------------------- |
| `region:imageTag`                  | Docker image tag (e.g., `sha-abc123`)        | Required             |
| `region:desiredInstances`          | **Number of VPN nodes to deploy**            | Same as minInstances |
| `region:minInstances`              | Minimum ASG instances (autoscaling floor)    | 1                    |
| `region:maxInstances`              | Maximum ASG instances (autoscaling ceiling)  | 10                   |
| `region:instanceType`              | EC2 instance type                            | `t3.medium`          |
| `region:adminCidr`                 | CIDR for admin port access                   | `0.0.0.0/0`          |
| `region:targetSessionsPerInstance` | Target sessions per instance for autoscaling | 100                  |

---

## Deployment Guide

### Prerequisites

1. AWS credentials configured (`aws configure` or environment variables)
2. Pulumi CLI installed
3. Bun installed

### Step 1: Install Dependencies

```bash
cd infra/pulumi
bun install
pulumi login
```

### Step 2: Deploy Global Stacks (Lambda Services)

These examples use **staging**; swap `staging` → `production` for prod.

```bash
cd infra/pulumi

# Create/select staging global stack
pulumi stack select global-staging || pulumi stack init global-staging

# Configure AWS region
pulumi config set aws:region us-east-1 --stack global-staging

# Configure ECR repository
pulumi config set global:ecrRepoName vpnvpn/rust-server --stack global-staging

# Configure secrets
pulumi config set --secret databaseUrl "postgresql://staging-user:..." --stack global-staging
pulumi config set --secret controlPlaneApiKey "staging-api-key" --stack global-staging
pulumi config set --secret bootstrapToken "staging-bootstrap-token" --stack global-staging

# Deploy
pulumi up -y --stack global-staging
```

After deployment, note the outputs:

- `controlPlaneApiUrl` - URL for the control plane API (wire this to `api.staging.vpnvpn.dev`).
- `metricsApiUrl` - URL for the metrics API.
- `ecrUri` - ECR repository URL.

Repeat the same process for `global-production` with production credentials.

### Step 3: Build and Push VPN Server Image (manual path)

```bash
cd ../../apps/vpn-server

# Build
docker build -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/vpnvpn/rust-server:v1.0.0 .

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Push
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/vpnvpn/rust-server:v1.0.0
```

### Step 4: Deploy Regional Stacks (VPN Nodes)

Deploy to one or more regions with your desired node count. These examples
use staging; swap `-staging` → `-production` for prod.

```bash
cd ../../infra/pulumi

# US East - staging, 3 nodes
pulumi stack select region-us-east-1-staging || pulumi stack init region-us-east-1-staging

pulumi config set aws:region us-east-1 --stack region-us-east-1-staging
pulumi config set global:ecrRepoName vpnvpn/rust-server --stack region-us-east-1-staging
pulumi config set region:imageTag sha-abc123 --stack region-us-east-1-staging
pulumi config set region:desiredInstances 3 --stack region-us-east-1-staging
pulumi config set region:minInstances 1 --stack region-us-east-1-staging
pulumi config set region:maxInstances 10 --stack region-us-east-1-staging

pulumi up -y --stack region-us-east-1-staging

# EU West - staging, 2 nodes
pulumi stack select region-eu-west-1-staging || pulumi stack init region-eu-west-1-staging

pulumi config set aws:region eu-west-1 --stack region-eu-west-1-staging
pulumi config set global:ecrRepoName vpnvpn/rust-server --stack region-eu-west-1-staging
pulumi config set region:imageTag sha-abc123 --stack region-eu-west-1-staging
pulumi config set region:desiredInstances 2 --stack region-eu-west-1-staging
pulumi config set region:minInstances 1 --stack region-eu-west-1-staging
pulumi config set region:maxInstances 8 --stack region-eu-west-1-staging

pulumi up -y --stack region-eu-west-1-staging
```

---

## Service Build/Deploy

- Pulumi builds and pushes vpn-server, control-plane, and metrics Docker images automatically via `command.local` in `infra/pulumi/index.ts` (no manual `bun run build:lambda` or S3 uploads).
- Images are pushed with both a build tag (`build-${SERVICE_BUILD_ID || GITHUB_SHA || timestamp}`) and an env tag (`staging-latest`/`production-latest`). Regional stacks default to `*-latest` unless `region:imageTag` is overridden.
- Ensure Docker is available wherever Pulumi runs so the local build step can push to ECR.

### Self-Hosted (Docker Compose)

Run services as containers without Lambda:

```bash
# Start local stack
cd local
docker compose up -d
```

---

## CrossGuard Policy Tests

Run infrastructure validation with CrossGuard:

```bash
cd infra/pulumi

# Install policy dependencies
cd policy && bun install && cd ..

# Preview with policy enforcement
pulumi preview --policy-pack ./policy

# Deploy with policy enforcement
pulumi up --policy-pack ./policy
```

Policies include:

- Required `Project` tags on all resources
- No public S3 buckets (except desktop releases)
- Lambda timeout and memory limits
- No unrestricted SSH access
- ECR scan-on-push enabled

---

## Scaling Operations

### Scale Up a Region (staging example)

```bash
pulumi stack select region-us-east-1-staging
pulumi config set region:desiredInstances 6
pulumi up -y
```

### Scale Down a Region (production example)

```bash
pulumi stack select region-eu-west-1-production
pulumi config set region:desiredInstances 2
pulumi up -y
```

### Destroy a Region (staging example)

```bash
pulumi stack select region-ap-southeast-1-staging
pulumi destroy -y
```

---

## Outputs

After deployment, each stack outputs:

### Global Stack

| Output               | Description                         |
| -------------------- | ----------------------------------- |
| `ecrUri`             | ECR repository URL                  |
| `controlPlaneApiUrl` | Control Plane API Gateway URL       |
| `metricsApiUrl`      | Metrics API Gateway URL             |
| `desktopBucketUrl`   | S3 bucket URL for desktop downloads |
| `lambdaCodeBucket`   | S3 bucket for Lambda code           |

### Regional Stack

| Output       | Description                                        |
| ------------ | -------------------------------------------------- |
| `nlbDnsName` | Network Load Balancer DNS name for VPN connections |

Get outputs:

```bash
# Staging
pulumi stack select global-staging
pulumi stack output controlPlaneApiUrl

pulumi stack select region-us-east-1-staging
pulumi stack output nlbDnsName

# Production
pulumi stack select global-production
pulumi stack output controlPlaneApiUrl

pulumi stack select region-us-east-1-production
pulumi stack output nlbDnsName
```

---

## Components

### ControlPlane (`controlPlane.ts`)

Creates Lambda + API Gateway for the control-plane service:

- IAM role with basic Lambda and VPC access
- Lambda function (ZIP or Docker image)
- HTTP API Gateway with CORS
- Lambda invoke permission

### MetricsService (`metricsService.ts`)

Creates Lambda + API Gateway for the metrics service:

- IAM role with basic Lambda and VPC access
- Lambda function (ZIP or Docker image)
- HTTP API Gateway with CORS
- Lambda invoke permission

### VpnAsg (`components/vpnAsg.ts`)

Creates an EC2 Auto Scaling Group with:

- Amazon Linux 2 instances running Docker
- User data that pulls the vpn-server image from ECR
- IP forwarding and NAT masquerade for VPN traffic
- Instance profile with ECR, SSM, CloudWatch, and AutoScaling permissions

### Observability (`observability.ts`)

Provisions Amazon Managed Prometheus (AMP) and Amazon Managed Grafana (AMG) workspaces.
