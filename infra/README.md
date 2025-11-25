# Infrastructure (Pulumi TypeScript)

This package defines the AWS compute, networking, and observability stack for vpnVPN's VPN data-plane.

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

The vpnVPN control plane is a **standalone Bun/TypeScript service** (`services/control-plane`) backed by Postgres. Pulumi simply reads the control-plane URL from configuration rather than provisioning AWS Lambdas or DynamoDB tables.

**Global resources always deploy to us-east-1**, while VPN nodes are distributed across multiple regions.

## Stacks

### `global` (us-east-1)

- ECR repository for `vpn-server` Docker images
- S3 bucket for desktop app downloads
- Control-plane URL configuration
- Observability resources (Amazon Managed Prometheus, Amazon Managed Grafana)

### `region-*` (e.g., `region-us-east-1`, `region-eu-west-1`)

Each regional stack creates:

- VPC with public/private subnets across 2 availability zones.
- Security groups for VPN protocols (WireGuard 51820/udp, OpenVPN 1194/udp, IKEv2 500+4500/udp) and admin port (8080/tcp).
- Network Load Balancer (NLB) for exposing VPN endpoints.
- EC2 Auto Scaling Group running the `vpn-server` container.
- Target-tracking autoscaling based on `ActiveSessions` CloudWatch metric.

## Configuration Reference

### Global Stack

| Config Key            | Description                                         | Default |
| --------------------- | --------------------------------------------------- | ------- |
| `global:ecrRepoName`  | ECR repository name                                 | `vpnvpn/rust-server` |
| `controlPlaneApiUrl`  | URL of the control-plane service                    | Required |

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

### Step 2: Deploy Global Stack

```bash
pulumi stack select global || pulumi stack init global
pulumi config set aws:region us-east-1
pulumi config set global:ecrRepoName vpnvpn/rust-server
pulumi config set controlPlaneApiUrl https://your-control-plane.example.com
pulumi up -y
```

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

### Step 4: Deploy Regional Stacks

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

#### Example: Asia Pacific (2 nodes)

```bash
pulumi stack select region-ap-southeast-1 || pulumi stack init region-ap-southeast-1

pulumi config set aws:region ap-southeast-1
pulumi config set global:ecrRepoName vpnvpn/rust-server
pulumi config set region:imageTag v1.0.0
pulumi config set region:desiredInstances 2
pulumi config set region:minInstances 1
pulumi config set region:maxInstances 5

pulumi up -y
```

---

## Multi-Region Distribution Example

To deploy 10 VPN nodes across 3 regions:

| Region           | Stack Name              | Nodes | Config                          |
| ---------------- | ----------------------- | ----- | ------------------------------- |
| US East          | `region-us-east-1`      | 4     | `desiredInstances: 4, min: 2, max: 10` |
| EU West          | `region-eu-west-1`      | 4     | `desiredInstances: 4, min: 2, max: 10` |
| Asia Pacific     | `region-ap-southeast-1` | 2     | `desiredInstances: 2, min: 1, max: 5`  |

Deploy all regions:

```bash
# Deploy US East with 4 nodes
pulumi stack select region-us-east-1
pulumi config set region:desiredInstances 4
pulumi up -y

# Deploy EU West with 4 nodes
pulumi stack select region-eu-west-1
pulumi config set aws:region eu-west-1
pulumi config set region:desiredInstances 4
pulumi up -y

# Deploy Asia Pacific with 2 nodes
pulumi stack select region-ap-southeast-1
pulumi config set aws:region ap-southeast-1
pulumi config set region:desiredInstances 2
pulumi up -y
```

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

After deployment, each regional stack outputs:

| Output        | Description                              |
| ------------- | ---------------------------------------- |
| `nlbDnsName`  | Network Load Balancer DNS name for VPN connections |

Get outputs:

```bash
pulumi stack select region-us-east-1
pulumi stack output nlbDnsName
```

---

## Components

### VpnAsg (`components/vpnAsg.ts`)

Creates an EC2 Auto Scaling Group with:

- Amazon Linux 2 instances running Docker
- User data that pulls the vpn-server image from ECR
- IP forwarding and NAT masquerade for VPN traffic
- Instance profile with ECR, SSM, CloudWatch, and AutoScaling permissions

### VpnPool (`components/vpnPool.ts`)

Alternative ECS Fargate-based deployment (available for reference, not used by default).

### Observability (`observability.ts`)

Provisions Amazon Managed Prometheus (AMP) and Amazon Managed Grafana (AMG) workspaces.
