# Configuration & Setup Guide

This guide covers the configuration for **Local**, **Staging**, and **Production** environments, including secrets management and initial setup.

## Environments

| Environment    | Domain               | Branch    | Database                | API URL                          |
| :------------- | :------------------- | :-------- | :---------------------- | :------------------------------- |
| **Local**      | `localhost:3000`     | N/A       | Local Docker / Neon Dev | `http://localhost:4000`          |
| **Staging**    | `staging.vpnvpn.dev` | `staging` | Neon Staging            | `https://api.staging.vpnvpn.dev` |
| **Production** | `vpnvpn.dev`         | `main`    | Neon Production         | `https://api.vpnvpn.dev`         |

---

## 1. Environment Variables

### Web App (`apps/web`)

| Variable                | Description                | Local Default           |
| :---------------------- | :------------------------- | :---------------------- |
| `NEXT_PUBLIC_API_URL`   | Control Plane API URL      | `http://localhost:4000` |
| `NEXTAUTH_URL`          | App URL                    | `http://localhost:3000` |
| `NEXTAUTH_SECRET`       | Session encryption key     | `development-secret...` |
| `DATABASE_URL`          | Postgres connection string | `postgresql://...`      |
| `STRIPE_SECRET_KEY`     | Stripe Secret Key          | `sk_test_...`           |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Secret      | `whsec_...`             |
| `RESEND_API_KEY`        | Resend API Key             | `re_...`                |
| `CONTROL_PLANE_API_KEY` | Internal API Auth Key      | `local-dev-key`         |
| `GITHUB_ID` / `SECRET`  | GitHub OAuth               | Test App Credentials    |
| `GOOGLE_ID` / `SECRET`  | Google OAuth               | Test App Credentials    |

### Control Plane & Metrics (`services/*`)

| Variable                | Description                    |
| :---------------------- | :----------------------------- |
| `DATABASE_URL`          | Postgres connection string     |
| `CONTROL_PLANE_API_KEY` | API Key for internal auth      |
| `VPN_TOKEN`             | Bootstrap token for VPN nodes  |
| `AWS_REGION`            | AWS Region (e.g., `us-east-1`) |

### VPN Nodes (`apps/vpn-server`)

| Variable      | Description           |
| :------------ | :-------------------- |
| `API_URL`     | Control Plane API URL |
| `VPN_TOKEN`   | Authentication Token  |
| `METRICS_URL` | Metrics Service URL   |

---

## 2. Secrets Management

### Vercel (Web App)

- **Production/Staging:** Set variables in Vercel Project Settings.
- **Local:** Use `.env.local` (do not commit!).

### AWS & Pulumi (Infrastructure)

We use **AWS Secrets Manager** and **Pulumi Secrets** for infrastructure credentials.

#### Pulumi Secrets

Set secrets for the active stack (encrypted in `Pulumi.<stack>.yaml`):

```bash
pulumi config set --secret databaseUrl "postgresql://..."
pulumi config set --secret controlPlaneApiKey "..."
pulumi config set --secret vpnToken "..."
```

#### AWS Secrets Manager

Used for critical secrets like database credentials that may need rotation.

```bash
aws secretsmanager create-secret --name vpnvpn/production/database --secret-string '{"url":"..."}'
```

---

## 3. Local Development Setup

### Prerequisites

- Bun 1.1+
- Docker & Docker Compose
- Rust toolchain

### Quick Start

1.  **Install Dependencies:**

    ```bash
    bun install
    ```

2.  **Environment Setup:**
    Copy `.env.local.example` to `.env.local` in `apps/web` and fill in values.

3.  **Run Full Stack:**
    ```bash
    bun run dev
    ```
    This starts Postgres, Control Plane, Metrics, VPN Node, and Web App via Docker Compose.

### Manual Service Run

- **Web:** `cd apps/web && bun run dev`
- **Control Plane:** `cd services/control-plane && bun run dev`
- **VPN Server:** `cd apps/vpn-server && cargo run -- run`

---

## 4. Staging & Production Setup

### Initial Infrastructure (Pulumi)

1.  **Global Stack (Control Plane, Metrics, DB):**

    ```bash
    cd infra/pulumi
    pulumi stack select global-staging # or global-production
    pulumi config set aws:region us-east-1
    pulumi config set --secret databaseUrl "..."
    pulumi config set --secret controlPlaneApiKey "..."
    pulumi up -y
    ```

2.  **Regional Stack (VPN Nodes):**
    ```bash
    pulumi stack select region-us-east-1-staging
    pulumi config set region:imageTag "staging-latest"
    pulumi config set region:desiredInstances 2
    pulumi up -y
    ```

### DNS Configuration (Route53)

Ensure `api.vpnvpn.dev` and `metrics.vpnvpn.dev` (and staging variants) are aliased to the correct API Gateway/ALB endpoints. Pulumi handles ACM certificate generation and validation automatically.

### Vercel Configuration

1.  Import project from GitHub.
2.  Configure Environment Variables (see Section 1).
3.  Deploy `main` (Prod) or `staging` (Staging).
