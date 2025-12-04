## CI/CD Overview

vpnVPN uses GitHub Actions, Bun/Turborepo, Pulumi, Vercel, and AWS to build, test, and deploy the monorepo.

### Environment model

| Component                    | Staging (`staging` branch)                               | Production (`main` branch)                        |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Web (Next.js)                | `staging.vpnvpn.dev` + `*.staging.vpnvpn.dev` via Vercel | `vpnvpn.dev` + `*.vpnvpn.dev` via Vercel          |
| App hostnames                | `app.staging.vpnvpn.dev` → `/desktop`                    | `app.vpnvpn.dev` → `/desktop`                     |
| Admin hostnames              | `admin.staging.vpnvpn.dev` → `/admin`                    | `admin.vpnvpn.dev` → `/admin`                     |
| Dashboard hostnames          | `dashboard.staging.vpnvpn.dev` → `/dashboard`            | `dashboard.vpnvpn.dev` → `/dashboard`             |
| API hostname                 | `api.staging.vpnvpn.dev` (AWS)                           | `api.vpnvpn.dev` (AWS)                            |
| Metrics hostname             | `metrics.staging.vpnvpn.dev` (AWS)                       | `metrics.vpnvpn.dev` (AWS)                        |
| Control Plane stack          | `global-staging`                                         | `global-production`                               |
| VPN region stack (us‑east‑1) | `region-us-east-1-staging`                               | `region-us-east-1-production`                     |
| Rust image tags (ECR)        | `staging-sha-<git_sha>`, `staging-latest`                | `prod-sha-<git_sha>`, `production-latest`         |
| Desktop build                | `desktop-build.yml` with `environment=staging`           | `desktop-build.yml` with `environment=production` |

**Branch rule:** merges to `staging` deploy the staging environment; merges to `main` deploy production. Manual `workflow_dispatch` always accepts an explicit `environment` input and can override the branch-derived default.

---

## Workflows (by environment)

### `.github/workflows/ci.yml` (Lint, test, build)

- **Triggers:** Pushes and pull requests to `main` and `staging`.
- **Behavior:** Pure CI (no deploy). Runs `bun run lint`, `bun run test`, and `bun run build` across:
  - `apps/web`, `apps/desktop`, `apps/vpn-server`
  - `services/control-plane`, `services/metrics`
  - `packages/db`

### `.github/workflows/rust-build-push.yml` (Rust data-plane image)

- **Name:** Build and Push Rust Server
- **Triggers:** Pushes to `main` or `staging` that touch `apps/vpn-server/**` or the workflow file.
- **Environment resolution:**
  - `DEPLOY_ENV=production` when `refs/heads/main`
  - `DEPLOY_ENV=staging` for `refs/heads/staging`
- **Tagging strategy:**
  - Always builds `ECR_URI:sha-${GITHUB_SHA}` and pushes it.
  - Also pushes an env-scoped tag:
    - Staging: `ECR_URI:staging-sha-${GITHUB_SHA}`
    - Production: `ECR_URI:prod-sha-${GITHUB_SHA}`
- **Outputs:** `IMAGE_TAG=sha-${GITHUB_SHA}`, `ECR_URI`, `ENV_TAG`.
- **Usage:** Pulumi stacks can either pin to a specific sha tag or to an env-specific tag if you want “latest staging/prod” semantics.

### `.github/workflows/services-deploy.yml` (Control Plane + Metrics Lambdas)

- **Name:** Deploy Services (Control Plane + Metrics)
- **Triggers:**
  - Pushes to `main` or `staging` that touch `services/**` or `packages/db/**`.
  - Manual `workflow_dispatch` with `environment` choice (`staging`, `production`).
- **Environment selection:**
  - If `workflow_dispatch`: uses `github.event.inputs.environment`.
  - Else: `main` → `production`, anything else (`staging`) → `staging`.
- **Pulumi stacks:**
  - Staging: `global-staging`
  - Production: `global-production`
- **Steps (per env):**
  1. Build Lambda bundles for `services/control-plane` and `services/metrics`.
  2. Zip and upload to `s3://$LAMBDA_CODE_BUCKET/control-plane/...` and `.../metrics/...`, maintaining `latest/` keys.
  3. `pulumi stack select global-${environment} || pulumi stack init ...`.
  4. Configure `aws:region`, DB/keys (`databaseUrl`, `controlPlaneApiKey`, `bootstrapToken`), and `global:controlPlaneCodeKey` / `global:metricsCodeKey`.
  5. `pulumi up -y --stack global-${environment}`.
- **API URLs:**
  - The `global-*` stack outputs `controlPlaneApiUrl` and `metricsApiUrl`. In production, this should be `https://api.vpnvpn.dev`. In staging, `https://api.staging.vpnvpn.dev`.

### `.github/workflows/pulumi-deploy.yml` (Global + Region vpn-server infra)

- **Name:** Pulumi Deploy (Global + Region)
- **Triggers:**
  - `workflow_run` of "Build and Push Rust Server" (automatic infra rollout after image build).
  - Manual `workflow_dispatch` with `environment` choice.
- **Environment selection:**
  - `workflow_dispatch`: `environment` input wins.
  - `workflow_run`: `head_branch == main` → `DEPLOY_ENV=production`, otherwise `DEPLOY_ENV=staging`.
- **Pulumi stacks:**
  - Global: `global-${DEPLOY_ENV}`.
  - Region us‑east‑1: `region-us-east-1-${DEPLOY_ENV}`.
- **Behavior:**
  1. Ensure both stacks exist (`pulumi stack select ... || pulumi stack init ...`).
  2. For `global-${DEPLOY_ENV}`:
     - Set `aws:region`, `global:ecrRepoName`, and secrets `databaseUrl`, `controlPlaneApiKey`, `bootstrapToken`.
     - `pulumi up -y --stack global-${DEPLOY_ENV}`.
  3. For `region-us-east-1-${DEPLOY_ENV}`:
     - Set `aws:region`, `global:ecrRepoName`.
     - Set `region:imageTag` to `sha-${GITHUB_SHA}` (or swap to `staging-sha-...` / `prod-sha-...` if you prefer env tags).
     - Set `region:desiredInstances`, `region:minInstances`, `region:maxInstances`, `region:adminCidr`.
     - `pulumi up -y --stack region-us-east-1-${DEPLOY_ENV}`.
- **Domains:**
  - You should configure Route 53/ACM so that:
    - `api.vpnvpn.dev` → production control-plane API (global-production).
    - `api.staging.vpnvpn.dev` → staging control-plane API (global-staging).

### `.github/workflows/desktop-build.yml` (Desktop app build + S3 upload)

- **Name:** Build Desktop App
- **Triggers:**
  - Pushes to `main` or `staging` that touch `apps/desktop/**`.
  - Manual `workflow_dispatch` with `environment` choice.
- **Environment selection:**
  - Same pattern as other workflows: `main` → `production`, otherwise `staging`, unless overridden by `workflow_dispatch` input.
- **URLs baked into desktop:**
  - Production:
    - `web_url=https://vpnvpn.dev`
    - `desktop_url=https://vpnvpn.dev/desktop?desktop=1`
  - Staging:
    - `web_url=https://staging.vpnvpn.dev`
    - `desktop_url=https://staging.vpnvpn.dev/desktop?desktop=1`
- **Outputs:**
  - Artifacts per platform uploaded to GitHub.
  - S3 uploads to `s3://vpnvpn-desktop-{environment}/releases/{environment}` (or a custom `DESKTOP_S3_BUCKET`), plus `vpnvpn-desktop-latest.*` convenience objects.

---

## Vercel and domains

- Single Vercel project for `apps/web` with:
  - Production domain: `vpnvpn.dev`.
  - Staging domain: `staging.vpnvpn.dev`.
- Additional subdomains (all via Vercel DNS or your registrar, CNAMEs into the Vercel project):
  - `app.vpnvpn.dev`, `app.staging.vpnvpn.dev` → app/desktop UI (`/desktop`).
  - `admin.vpnvpn.dev`, `admin.staging.vpnvpn.dev` → admin UI (`/admin`).
  - `dashboard.vpnvpn.dev`, `dashboard.staging.vpnvpn.dev` → dashboard (`/dashboard`).
- Host-based routing is implemented in `apps/web/middleware.ts`:
  - `dashboard.*` → `/dashboard`.
  - `admin.*` → `/admin`.
  - `app.*` → `/desktop`.
- Required Vercel environment variables (per environment):
  - `NEXTAUTH_URL`
  - `NEXT_PUBLIC_API_URL` (point this to `https://api.staging.vpnvpn.dev` or `https://api.vpnvpn.dev`).
  - Any NextAuth provider secrets, Stripe keys, etc., scoped per environment.

---

## AWS / Pulumi stacks

### Stack naming

- **Global (control-plane, metrics, shared infra):**
  - Staging: `global-staging`
  - Production: `global-production`
- **Regional VPN nodes (example: us‑east‑1):**
  - Staging: `region-us-east-1-staging`
  - Production: `region-us-east-1-production`

Pulumi will create `Pulumi.global-staging.yaml`, `Pulumi.global-production.yaml`, `Pulumi.region-us-east-1-staging.yaml`, etc., the first time each stack is initialized. Those files should be committed once they contain the desired baseline configuration.

### Key config values

- **Global stacks (`global-*`):**
  - `aws:region` → `us-east-1`.
  - `global:ecrRepoName` → e.g. `vpnvpn/rust-server`.
  - `databaseUrl` (secret) → staging vs production Postgres URLs.
  - `controlPlaneApiKey` (secret) → separate keys per environment.
  - `bootstrapToken` (secret) → separate node bootstrap tokens per environment.
  - `global:controlPlaneCodeKey` / `global:metricsCodeKey` → S3 keys for latest Lambda bundles.
  - `controlPlaneApiUrl` (output) → should be wired to `https://api.staging.vpnvpn.dev` or `https://api.vpnvpn.dev`.
  - `metricsApiUrl` (output) → should be wired to `https://metrics.staging.vpnvpn.dev` or `https://metrics.vpnvpn.dev`.
- **Region stacks (`region-*`):**
  - `aws:region` → region of the ASG (e.g. `us-east-1`).
  - `global:ecrRepoName` → same repo, but image tag is env-specific.
  - `region:imageTag` → `sha-<git_sha>` or `staging-sha-<git_sha>` / `prod-sha-<git_sha>`.
  - `region:desiredInstances`, `region:minInstances`, `region:maxInstances`, `region:instanceType`, `region:adminCidr`, `region:targetSessionsPerInstance`.

See `infra/README.md` for more detailed Pulumi examples.

---

## GitHub secrets and vars (per environment)

The same secret names are used for staging and production, but scoped via GitHub Environments:

| Location        | Secret/Var                                                        | Notes                                      |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Repo or env     | `AWS_REGION`                                                      | Usually `us-east-1`.                       |
| Repo or env     | `AWS_ACCOUNT_ID`                                                  | Shared account, same for staging and prod. |
| Repo or env     | `AWS_ROLE_TO_ASSUME`                                              | IAM role for OIDC GitHub → AWS.            |
| Repo or env     | `PULUMI_ACCESS_TOKEN`                                             | Pulumi backend.                            |
| Env: staging    | `DATABASE_URL`                                                    | Staging Postgres DSN.                      |
| Env: production | `DATABASE_URL`                                                    | Production Postgres DSN.                   |
| Env: staging    | `CONTROL_PLANE_API_KEY`                                           | Staging API key.                           |
| Env: production | `CONTROL_PLANE_API_KEY`                                           | Production API key.                        |
| Env: staging    | `VPN_TOKEN`                                                       | Staging node bootstrap token.              |
| Env: production | `VPN_TOKEN`                                                       | Production node bootstrap token.           |
| Env: staging    | `DESKTOP_S3_BUCKET`                                               | `vpnvpn-desktop-staging` or similar.       |
| Env: production | `DESKTOP_S3_BUCKET`                                               | `vpnvpn-desktop-production` or similar.    |
| Repo vars       | `VPN_DESIRED_INSTANCES`, `VPN_MIN_INSTANCES`, `VPN_MAX_INSTANCES` | Defaults for vpn-server ASGs.              |

---

## Manual deployment vs CI

### Normal flows (recommended)

- **Staging:**
  - Merge to `staging`.
  - GitHub Actions:
    - Runs tests/builds (`ci.yml`).
    - Builds and pushes Rust image (`rust-build-push.yml`).
    - Deploys control-plane + metrics (`services-deploy.yml` with `environment=staging`).
    - Deploys infra + VPN nodes (`pulumi-deploy.yml` with `DEPLOY_ENV=staging`).
    - Builds and publishes desktop artifacts (`desktop-build.yml` with `environment=staging`).
- **Production:**
  - Merge to `main`.
  - Same workflows, but with `environment=production` / `DEPLOY_ENV=production`.

### Manual infra deployment (`scripts/deploy.sh`)

From the repo root:

```bash
# Staging infra
./scripts/deploy.sh staging

# Production infra
./scripts/deploy.sh production

# Optionally also build/upload desktop from your machine (legacy path)
./scripts/deploy.sh staging --with-desktop
```

The script:

1. Loads environment variables from root `.env`.
2. Deploys the environment-specific global Pulumi stack (`global-staging` / `global-production`).
3. Builds and pushes the vpn-server Docker image to ECR with an env-specific tag.
4. Deploys VPN nodes to regions defined in `scripts/regions.json` using `region-<aws-region>-<environment>` stacks.
5. Optionally builds desktop apps and uploads them to S3 when `--with-desktop` is supplied (CI is preferred for desktop).

### Region configuration (manual + script)

`scripts/regions.json` controls how many nodes you want per region and per environment:

```json
{
  "staging": [{ "region": "us-east-1", "nodes": 1, "min": 1, "max": 3 }],
  "production": [
    { "region": "us-east-1", "nodes": 3, "min": 2, "max": 10 },
    { "region": "eu-west-1", "nodes": 2, "min": 1, "max": 8 },
    { "region": "ap-southeast-1", "nodes": 1, "min": 1, "max": 5 }
  ]
}
```

Each entry results in a separate Pulumi stack named `region-<region>-<environment>` (for example `region-us-east-1-staging`).

---

## CrossGuard policy tests

The infrastructure includes CrossGuard policies for security and compliance validation:

```bash
cd infra/pulumi

# Run with policy enforcement
pulumi preview --policy-pack ./policy
pulumi up --policy-pack ./policy

# Policies include:
# - Required Project tags on all resources
# - No public S3 buckets (except desktop releases)
# - Lambda timeout and memory limits
# - No unrestricted SSH access
# - ECR scan-on-push enabled
```

---

## Staging deployment cookbook (CI-first)

This section is a concrete, copy-pasteable guide for deploying **staging** from scratch.

### 1. One-time setup

1. **Vercel**
   - Create/import the project from the GitHub repo pointing at `apps/web`.
   - Add domains:
     - `staging.vpnvpn.dev` (primary).
     - `app.staging.vpnvpn.dev`, `admin.staging.vpnvpn.dev`, `dashboard.staging.vpnvpn.dev` (CNAME → Vercel).
   - Set env vars for **Preview + Production** in Vercel to match staging:
     - `NEXTAUTH_URL=https://staging.vpnvpn.dev`.
     - `NEXT_PUBLIC_API_URL=https://api.staging.vpnvpn.dev`.
     - All NextAuth provider secrets, Stripe keys, etc., for staging.

2. **AWS / Route 53**
   - Create `api.staging.vpnvpn.dev` in Route 53:
     - If using API Gateway: CNAME to the staging API Gateway hostname.
     - If using ALB: alias to the staging ALB.
   - Create `metrics.staging.vpnvpn.dev` pointing at the staging metrics endpoint
     exported by `metricsApiUrl` from `global-staging`.
   - Issue ACM certificates for:
     - `api.staging.vpnvpn.dev`.
     - `metrics.staging.vpnvpn.dev`.
     - `*.staging.vpnvpn.dev` if needed for control-plane → web callbacks.

3. **Pulumi stacks**
   - From `infra/pulumi`:

```bash
cd infra/pulumi
bun install
pulumi login

# Global staging stack
pulumi stack init global-staging
pulumi config set aws:region us-east-1 --stack global-staging
pulumi config set global:ecrRepoName vpnvpn/rust-server --stack global-staging
pulumi config set --secret databaseUrl "postgres://staging-user:..." --stack global-staging
pulumi config set --secret controlPlaneApiKey "staging-api-key" --stack global-staging
pulumi config set --secret bootstrapToken "staging-bootstrap-token" --stack global-staging

# First deploy
pulumi up -y --stack global-staging
```

- Note `controlPlaneApiUrl` from `pulumi stack output controlPlaneApiUrl --stack global-staging` and point `api.staging.vpnvpn.dev` at it.

4. **GitHub environments / secrets**
   - In the repo Settings → Environments, create a `staging` environment.
   - Add:
     - `AWS_REGION=us-east-1`.
     - `AWS_ACCOUNT_ID=...`.
     - `AWS_ROLE_TO_ASSUME=arn:aws:iam::<account>:role/github-oidc-role`.
     - `PULUMI_ACCESS_TOKEN=...`.
     - `DATABASE_URL` → the same DSN you used in `global-staging`.
     - `CONTROL_PLANE_API_KEY` → same as `controlPlaneApiKey` in `global-staging`.
     - `VPN_TOKEN` → same as `bootstrapToken` in `global-staging`.
     - `DESKTOP_S3_BUCKET=vpnvpn-desktop-staging` (or your chosen name).
   - Add repo-level variables (optional but recommended):

```bash
VPN_DESIRED_INSTANCES=2
VPN_MIN_INSTANCES=1
VPN_MAX_INSTANCES=10
```

5. **Regions JSON**

```json
{
  "staging": [{ "region": "us-east-1", "nodes": 1, "min": 1, "max": 3 }],
  "production": []
}
```

### 2. Day-to-day staging deploy (after setup)

1. Open a PR targeting `staging`.
2. CI (`ci.yml`) runs lint/test/build.
3. Merge into `staging`:
   - `rust-build-push.yml` builds `apps/vpn-server`, pushes:
     - `ECR_URI:sha-<sha>`.
     - `ECR_URI:staging-sha-<sha>`.
   - `services-deploy.yml` runs with `environment=staging`:
     - Builds Lambdas and updates `global-staging` with latest Lambda S3 keys.
   - `pulumi-deploy.yml` runs with `DEPLOY_ENV=staging`:
     - Updates `global-staging` (infra).
     - Updates `region-us-east-1-staging` with fresh `region:imageTag=sha-<sha>` and node counts from repo vars.
   - `desktop-build.yml` runs with `environment=staging`:
     - Builds desktop for all platforms and pushes to `s3://vpnvpn-desktop-staging/releases/staging`.

4. Validate:
   - Web: `https://staging.vpnvpn.dev`.
   - API: `https://api.staging.vpnvpn.dev/health`.
   - Desktop downloads: URLs printed at the end of `desktop-build.yml` logs.

---

## Production deployment cookbook (CI-first)

Production is almost identical to staging, but uses:

- Branch: `main`.
- Pulumi stacks: `global-production`, `region-us-east-1-production`, etc.
- Hostnames: `vpnvpn.dev`, `app.vpnvpn.dev`, `admin.vpnvpn.dev`, `dashboard.vpnvpn.dev`, `api.vpnvpn.dev`.

### 1. One-time setup

1. **Vercel**
   - Ensure the same project also has:
     - Production domain: `vpnvpn.dev`.
     - `app.vpnvpn.dev`, `admin.vpnvpn.dev`, `dashboard.vpnvpn.dev`.
   - Set Production env vars:
     - `NEXTAUTH_URL=https://vpnvpn.dev`.
     - `NEXT_PUBLIC_API_URL=https://api.vpnvpn.dev`.
     - Production NextAuth provider secrets, Stripe keys, etc.

2. **AWS / Route 53**
   - Configure `api.vpnvpn.dev` pointing at the **production** control-plane API (API Gateway or ALB) output by `controlPlaneApiUrl` in `global-production`.
   - Configure `metrics.vpnvpn.dev` pointing at the **production** metrics endpoint from `metricsApiUrl` in `global-production`.
   - Issue ACM certs for:
     - `api.vpnvpn.dev`.
     - `metrics.vpnvpn.dev`.
     - `*.vpnvpn.dev` if required.

3. **Pulumi stacks**

```bash
cd infra/pulumi

# Global production stack
pulumi stack init global-production
pulumi config set aws:region us-east-1 --stack global-production
pulumi config set global:ecrRepoName vpnvpn/rust-server --stack global-production
pulumi config set --secret databaseUrl "postgres://prod-user:..." --stack global-production
pulumi config set --secret controlPlaneApiKey "prod-api-key" --stack global-production
pulumi config set --secret bootstrapToken "prod-bootstrap-token" --stack global-production

pulumi up -y --stack global-production
```

- Wire `api.vpnvpn.dev` to `controlPlaneApiUrl` from `global-production`.

4. **GitHub environments / secrets**
   - Create `production` environment in the repo.
   - Add:
     - `AWS_REGION`, `AWS_ACCOUNT_ID`, `AWS_ROLE_TO_ASSUME`, `PULUMI_ACCESS_TOKEN`.
     - `DATABASE_URL` (production DSN).
     - `CONTROL_PLANE_API_KEY` (prod key).
     - `VPN_TOKEN` (prod bootstrap token).
     - `DESKTOP_S3_BUCKET=vpnvpn-desktop-production`.
   - Optionally override VPN node counts for prod via repo vars if needed.

5. **Regions JSON**

```json
{
  "staging": [{ "region": "us-east-1", "nodes": 1, "min": 1, "max": 3 }],
  "production": [
    { "region": "us-east-1", "nodes": 3, "min": 2, "max": 10 },
    { "region": "eu-west-1", "nodes": 2, "min": 1, "max": 8 }
  ]
}
```

### 2. Day-to-day production deploy (after setup)

1. Open a PR targeting `main` (from `staging` or feature branches).
2. CI (`ci.yml`) runs on the PR.
3. Merge into `main`:
   - `rust-build-push.yml` builds the VPN server image and pushes:
     - `ECR_URI:sha-<sha>`.
     - `ECR_URI:prod-sha-<sha>`.
   - `services-deploy.yml` runs with `environment=production`, updating `global-production` with latest Lambda bundles and secrets.
   - `pulumi-deploy.yml` runs with `DEPLOY_ENV=production`, updating:
     - `global-production`.
     - `region-us-east-1-production` and any additional `region-*-production` stacks configured.
   - `desktop-build.yml` runs with `environment=production`, building and publishing production desktop installers.

4. Validate:
   - Web: `https://vpnvpn.dev`.
   - API: `https://api.vpnvpn.dev/health`.
   - Admin: `https://admin.vpnvpn.dev`.
   - Dashboard: `https://dashboard.vpnvpn.dev`.
   - Desktop downloads: `vpnvpn-desktop-production` S3 bucket URLs from workflow logs.

---

## Manual Pulumi workflows (advanced)

If you need to bypass CI for a one-off change:

### Update only staging VPN node count (no image change)

```bash
cd infra/pulumi
pulumi stack select region-us-east-1-staging
pulumi config set region:desiredInstances 5
pulumi up -y
```

### Roll back staging to a previous image tag

1. Find the previous `sha-<sha>` you want (from `rust-build-push.yml` history).
2. Update the stack:

```bash
cd infra/pulumi
pulumi stack select region-us-east-1-staging
pulumi config set region:imageTag sha-<previous_sha>
pulumi up -y
```

### Re-run only the global production stack

```bash
cd infra/pulumi
pulumi stack select global-production
pulumi up -y
```

For more Pulumi-specific details (components, outputs, and local workflows),
see `infra/README.md`.
