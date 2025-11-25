# Infrastructure (Pulumi TypeScript)

This package defines the AWS compute, networking, and observability stack for vpnVPN's VPN data-plane and services.

## Quick Start

Use the deployment script for automated deployment:

```bash
# Deploy to staging (from project root)
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production

# Skip desktop builds
./scripts/deploy.sh staging --skip-desktop

# Skip VPN node deployment
./scripts/deploy.sh production --skip-vpn-nodes
```

The script reads configuration from:
- **Root `.env`** - Environment variables for all services
- **`scripts/regions.json`** - VPN node distribution per region

## Architecture

The vpnVPN infrastructure includes:

1. **Control Plane:** AWS Lambda + API Gateway (or standalone containers)
2. **Metrics Service:** AWS Lambda + API Gateway (or standalone containers)
3. **VPN Nodes:** EC2 Auto Scaling Groups behind Network Load Balancers
4. **Desktop Distribution:** S3 bucket with public access

**Global resources always deploy to us-east-1**, while VPN nodes are distributed across multiple regions.

## Stacks

### `global` (us-east-1)

- ECR repository for `vpn-server` Docker images
- S3 bucket for desktop app downloads
- S3 bucket for Lambda deployment packages
- Control Plane Lambda + API Gateway
- Metrics Service Lambda + API Gateway
- Observability resources (Amazon Managed Prometheus, Amazon Managed Grafana)

### `region-*` (e.g., `region-us-east-1`, `region-eu-west-1`)

Each regional stack creates:

- VPC with public/private subnets across 2 availability zones
- Security groups for VPN protocols (WireGuard 51820/udp, OpenVPN 1194/udp, IKEv2 500+4500/udp) and admin port (8080/tcp)
- Network Load Balancer (NLB) for exposing VPN endpoints
- EC2 Auto Scaling Group running the `vpn-server` container
- Target-tracking autoscaling based on `ActiveSessions` CloudWatch metric

## Configuration Reference

### Global Stack

| Config Key                 | Description                                         | Default |
| -------------------------- | --------------------------------------------------- | ------- |
| `global:ecrRepoName`       | ECR repository name                                 | `vpnvpn/rust-server` |
| `global:desktopBucket`     | S3 bucket for desktop releases                      | `vpnvpn-desktop-releases` |
| `global:codeBucket`        | S3 bucket for Lambda code                           | `vpnvpn-lambda-deployments` |
| `global:controlPlaneCodeKey` | S3 key for control-plane Lambda package           | - |
| `global:controlPlaneImageUri` | ECR URI for control-plane Docker image           | - |
| `global:metricsCodeKey`    | S3 key for metrics Lambda package                   | - |
| `global:metricsImageUri`   | ECR URI for metrics Docker image                    | - |
| `databaseUrl` (secret)     | PostgreSQL connection string                        | Required |
| `controlPlaneApiKey` (secret) | API key for control plane                        | Required |
| `bootstrapToken` (secret)  | Bootstrap token for VPN nodes                       | - |

### Region Stack

| Config Key                         | Description                                              | Default |
| ---------------------------------- | -------------------------------------------------------- | ------- |
| `region:imageTag`                  | Docker image tag (e.g., `sha-abc123`)                    | Required |
| `region:desiredInstances`          | **Number of VPN nodes to deploy**                        | Same as minInstances |
| `region:minInstances`              | Minimum ASG instances (autoscaling floor)                | 1 |
| `region:maxInstances`              | Maximum ASG instances (autoscaling ceiling)              | 10 |
| `region:instanceType`              | EC2 instance type                                        | `t3.medium` |
| `region:adminCidr`                 | CIDR for admin port access                               | `0.0.0.0/0` |
| `region:targetSessionsPerInstance` | Target sessions per instance for autoscaling             | 100 |

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

### Step 2: Deploy Global Stack (Lambda Services)

```bash
pulumi stack select global || pulumi stack init global

# Configure AWS region
pulumi config set aws:region us-east-1

# Configure ECR repository
pulumi config set global:ecrRepoName vpnvpn/rust-server

# Configure secrets
pulumi config set --secret databaseUrl "postgresql://..."
pulumi config set --secret controlPlaneApiKey "your-api-key"
pulumi config set --secret bootstrapToken "your-bootstrap-token"

# Deploy
pulumi up -y
```

After deployment, note the outputs:
- `controlPlaneApiUrl` - URL for the control plane API
- `metricsApiUrl` - URL for the metrics API
- `ecrUri` - ECR repository URL

### Step 3: Build and Push VPN Server Image

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

Deploy to one or more regions with your desired node count:

```bash
cd ../../infra/pulumi
```

#### Example: US East (3 nodes)

```bash
pulumi stack select region-us-east-1 || pulumi stack init region-us-east-1

pulumi config set aws:region us-east-1
pulumi config set global:ecrRepoName vpnvpn/rust-server
pulumi config set region:imageTag v1.0.0
pulumi config set region:desiredInstances 3
pulumi config set region:minInstances 1
pulumi config set region:maxInstances 10

pulumi up -y
```

#### Example: EU West (5 nodes)

```bash
pulumi stack select region-eu-west-1 || pulumi stack init region-eu-west-1

pulumi config set aws:region eu-west-1
pulumi config set global:ecrRepoName vpnvpn/rust-server
pulumi config set region:imageTag v1.0.0
pulumi config set region:desiredInstances 5
pulumi config set region:minInstances 2
pulumi config set region:maxInstances 15

pulumi up -y
```

---

## Lambda Deployment Options

### Option 1: ZIP Deployment (Recommended)

Build and upload Lambda packages to S3:

```bash
# Build Lambda packages
cd services/control-plane && bun run build:lambda
cd ../metrics && bun run build:lambda

# Upload to S3
aws s3 cp services/control-plane/dist/lambda/lambda.js s3://vpnvpn-lambda-deployments/control-plane/latest/
aws s3 cp services/metrics/dist/lambda/lambda.js s3://vpnvpn-lambda-deployments/metrics/latest/

# Configure Pulumi
cd infra/pulumi
pulumi config set global:controlPlaneCodeKey control-plane/latest/lambda.js
pulumi config set global:metricsCodeKey metrics/latest/lambda.js
pulumi up -y
```

### Option 2: Docker Image Deployment

Build and push Docker images to ECR:

```bash
# Build images
docker build -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/vpnvpn/control-plane:latest \
  -f services/control-plane/Dockerfile .
docker build -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/vpnvpn/metrics:latest \
  -f services/metrics/Dockerfile .

# Push to ECR
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/vpnvpn/control-plane:latest
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/vpnvpn/metrics:latest

# Configure Pulumi
cd infra/pulumi
pulumi config set global:controlPlaneImageUri <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/vpnvpn/control-plane:latest
pulumi config set global:metricsImageUri <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/vpnvpn/metrics:latest
pulumi up -y
```

### Option 3: Self-Hosted (Docker Compose)

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

### Scale Up a Region

```bash
pulumi stack select region-us-east-1
pulumi config set region:desiredInstances 6
pulumi up -y
```

### Scale Down a Region

```bash
pulumi stack select region-eu-west-1
pulumi config set region:desiredInstances 2
pulumi up -y
```

### Destroy a Region

```bash
pulumi stack select region-ap-southeast-1
pulumi destroy -y
```

---

## Outputs

After deployment, each stack outputs:

### Global Stack

| Output                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `ecrUri`                | ECR repository URL                       |
| `controlPlaneApiUrl`    | Control Plane API Gateway URL            |
| `metricsApiUrl`         | Metrics API Gateway URL                  |
| `desktopBucketUrl`      | S3 bucket URL for desktop downloads      |
| `lambdaCodeBucket`      | S3 bucket for Lambda code                |

### Regional Stack

| Output        | Description                              |
| ------------- | ---------------------------------------- |
| `nlbDnsName`  | Network Load Balancer DNS name for VPN connections |

Get outputs:

```bash
pulumi stack select global
pulumi stack output controlPlaneApiUrl

pulumi stack select region-us-east-1
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
