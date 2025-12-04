# Deployment Guide

This guide details the CI/CD pipelines and manual deployment procedures for vpnVPN.

## CI/CD Pipelines (GitHub Actions)

We use GitHub Actions for automated testing, building, and deployment.

### 1. Backend Deployment (`deploy-backend.yml`)

**Triggers:**

- Push to `main` (Production) or `staging` (Staging).
- Changes in: `apps/vpn-server`, `services`, `packages/db`, `infra/pulumi`.

**Workflow:**

1.  **`changes`**: Detects which components (Rust Server, Services, Infra) have changed.
2.  **`build-rust`**: Builds Docker image, pushes to ECR with tags (`staging-latest` or `prod-latest`).
3.  **`build-services`**: Builds Lambda functions, zips them, and uploads to S3.
4.  **`deploy-infra`**: Runs `pulumi up` for:
    - **Global Stack:** Updates Control Plane & Metrics Service (using new Lambda code).
    - **Region Stack:** Updates VPN ASGs (using new Docker image tag).

### 2. Web Deployment (`web-deploy.yml`)

**Triggers:**

- Push to `main` or `staging` affecting `apps/web`.

**Workflow:**

- **Staging:** Deploys to Vercel Preview/Staging (`staging.vpnvpn.dev`).
- **Production:** Deploys to Vercel Production (`vpnvpn.dev`).

### 3. CI Checks (`ci.yml`)

**Triggers:**

- Push to `main` or `staging`.

**Workflow:**

- Runs `lint`, `test`, and `build` (type-check) for the entire monorepo to ensure code quality.

---

## Manual Deployment

If GitHub Actions is unavailable, you can deploy manually.

### Prerequisites

- Pulumi CLI installed and logged in.
- AWS Credentials configured (`AWS_PROFILE` or env vars).
- Docker installed (for VPN server build).

### Deployment Script

Use the helper script to deploy the full stack:

```bash
# Deploy Staging
./scripts/deploy.sh staging

# Deploy Production
./scripts/deploy.sh production
```

### Manual Steps

#### 1. Deploy Global Infrastructure

```bash
cd infra/pulumi
pulumi stack select global-staging
pulumi up -y
```

#### 2. Build & Push VPN Server

```bash
cd apps/vpn-server
# Authenticate ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build & Push
docker build -t vpn-server .
docker tag vpn-server <ECR_URI>:staging-latest
docker push <ECR_URI>:staging-latest
```

#### 3. Deploy Regional Infrastructure

```bash
cd infra/pulumi
pulumi stack select region-us-east-1-staging
pulumi config set region:imageTag "staging-latest"
pulumi up -y
```

---

## Branching Strategy

- **`main`**: Production branch. Deploys to `vpnvpn.dev`. Protected branch.
- **`staging`**: Staging branch. Deploys to `staging.vpnvpn.dev`. Used for integration testing.
- **Feature Branches**: Created from `staging` or `main`. PRs trigger CI checks.
