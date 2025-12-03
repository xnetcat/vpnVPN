# Secrets Management Guide

This guide covers best practices for managing secrets across vpnVPN's infrastructure.

---

## Table of Contents

1. [Overview](#overview)
2. [Secret Categories](#secret-categories)
3. [Vercel Secrets](#vercel-secrets)
4. [AWS Secrets](#aws-secrets)
5. [Pulumi Secrets](#pulumi-secrets)
6. [GitHub Actions Secrets](#github-actions-secrets)
7. [Local Development](#local-development)
8. [Secret Rotation](#secret-rotation)
9. [Security Best Practices](#security-best-practices)

---

## Overview

vpnVPN uses secrets across multiple platforms:

| Platform | Purpose | Secret Types |
|----------|---------|--------------|
| Vercel | Web app hosting | API keys, OAuth credentials, database URL |
| AWS | Infrastructure & Lambda | IAM credentials, database URL, API keys |
| Pulumi | Infrastructure as Code | Stack configuration, encrypted values |
| GitHub Actions | CI/CD | Deployment credentials, tokens |
| Local | Development | All of the above (non-production values) |

---

## Secret Categories

### Critical Secrets (Highest Protection)

- `DATABASE_URL` - Full database access
- `STRIPE_SECRET_KEY` - Payment processing
- `NEXTAUTH_SECRET` - Session encryption
- AWS IAM credentials

### Sensitive Secrets (High Protection)

- `CONTROL_PLANE_API_KEY` - Internal API auth
- `RESEND_API_KEY` - Email sending
- OAuth client secrets
- VPN node tokens

### Configuration Values (Medium Protection)

- `STRIPE_WEBHOOK_SECRET` - Webhook verification
- Public API URLs
- Feature flags

---

## Vercel Secrets

### Environment Variable Categories

Vercel supports three environment scopes:

| Scope | When Used | Use For |
|-------|-----------|---------|
| Production | Production deployments only | Live API keys, production DB |
| Preview | Preview deployments (PRs) | Staging API keys, test DB |
| Development | `vercel dev` locally | Development values |

### Setting Environment Variables

**Via Vercel Dashboard:**

1. Go to Project Settings → Environment Variables
2. Add variable with name and value
3. Select appropriate environments
4. Mark as "Sensitive" for secrets (hides value after saving)

**Via Vercel CLI:**

```bash
# Add secret (prompts for value)
vercel env add STRIPE_SECRET_KEY production

# Add from file
vercel env add STRIPE_SECRET_KEY production < secret.txt

# List all variables
vercel env ls

# Pull to local .env
vercel env pull .env.local
```

### Recommended Configuration

```bash
# Production Environment Variables
DATABASE_URL=postgresql://...@neon.tech/vpnvpn_prod
NEXTAUTH_URL=https://vpnvpn.com
NEXTAUTH_SECRET=<generate-unique-32-byte-secret>

# OAuth (same for all environments or use separate apps)
GITHUB_ID=<production-github-app-id>
GITHUB_SECRET=<production-github-app-secret>
GOOGLE_CLIENT_ID=<production-google-client-id>
GOOGLE_CLIENT_SECRET=<production-google-client-secret>

# Stripe (use live keys for production)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_BASIC=price_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_ENTERPRISE=price_...

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@vpnvpn.com

# Control Plane
CONTROL_PLANE_API_URL=https://api.vpnvpn.com
CONTROL_PLANE_API_KEY=<secure-random-key>

# Public Variables (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_WG_ENDPOINT=vpn.vpnvpn.com:51820
NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY=<wireguard-server-pubkey>
NEXT_PUBLIC_DESKTOP_BUCKET_URL=https://vpnvpn-desktop-prod.s3.amazonaws.com
```

### Sensitive Variable Handling

Mark these as "Sensitive" in Vercel:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `CONTROL_PLANE_API_KEY`
- All OAuth secrets

---

## AWS Secrets

### Options Comparison

| Service | Best For | Cost | Rotation |
|---------|----------|------|----------|
| Secrets Manager | Critical secrets | $0.40/secret/month | Built-in |
| Parameter Store (SecureString) | Most secrets | Free (up to 10K) | Manual |
| Environment Variables | Lambda config | Free | Redeploy |

### AWS Secrets Manager

**Use for:** Database credentials, API keys that need rotation

```bash
# Create a secret
aws secretsmanager create-secret \
  --name vpnvpn/production/database \
  --secret-string '{"url":"postgresql://..."}' \
  --region us-east-1

# Retrieve a secret
aws secretsmanager get-secret-value \
  --secret-id vpnvpn/production/database \
  --region us-east-1

# Update a secret
aws secretsmanager update-secret \
  --secret-id vpnvpn/production/database \
  --secret-string '{"url":"new-postgresql://..."}'
```

**Accessing from Lambda:**

```typescript
import { SecretsManager } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManager({ region: "us-east-1" });

async function getSecret(secretId: string) {
  const response = await client.getSecretValue({ SecretId: secretId });
  return JSON.parse(response.SecretString || "{}");
}
```

### Systems Manager Parameter Store

**Use for:** Most configuration, non-rotating secrets

```bash
# Create parameter (SecureString = encrypted)
aws ssm put-parameter \
  --name /vpnvpn/production/control-plane-api-key \
  --value "your-api-key" \
  --type SecureString \
  --region us-east-1

# Get parameter
aws ssm get-parameter \
  --name /vpnvpn/production/control-plane-api-key \
  --with-decryption \
  --region us-east-1

# List parameters by path
aws ssm get-parameters-by-path \
  --path /vpnvpn/production \
  --with-decryption
```

**Naming Convention:**

```
/vpnvpn/{environment}/{service}/{key}

Examples:
/vpnvpn/production/web/nextauth-secret
/vpnvpn/production/control-plane/api-key
/vpnvpn/staging/vpn-node/token
```

### IAM Roles and OIDC

**For GitHub Actions (no long-lived credentials):**

1. Create OIDC Identity Provider in IAM
2. Create IAM Role with trust policy for GitHub
3. Use `aws-actions/configure-aws-credentials` with role ARN

```yaml
# Trust Policy
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:your-org/vpnvpn:*"
        }
      }
    }
  ]
}
```

```yaml
# GitHub Actions usage
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsRole
    aws-region: us-east-1
```

---

## Pulumi Secrets

### Stack Configuration

Pulumi encrypts secrets in stack configuration files.

```bash
# Set a secret (encrypted in Pulumi.stack.yaml)
pulumi config set --secret databaseUrl "postgresql://..."

# Set non-secret config
pulumi config set region us-east-1

# View config (secrets shown as [secret])
pulumi config

# Get decrypted value
pulumi config get databaseUrl
```

### Encrypted Config File Example

```yaml
# Pulumi.production.yaml
config:
  aws:region: us-east-1
  vpnvpn:environment: production
  vpnvpn:databaseUrl:
    secure: AAABAxxxxxxxxx...  # Encrypted
  vpnvpn:controlPlaneApiKey:
    secure: AAABAxxxxxxxxx...  # Encrypted
```

### Accessing Secrets in Code

```typescript
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// Get secret (returns Output<string>)
const dbUrl = config.requireSecret("databaseUrl");

// Get plain config
const region = config.require("region");

// Use in resources
const lambda = new aws.lambda.Function("control-plane", {
  environment: {
    variables: {
      DATABASE_URL: dbUrl,  // Pulumi handles secret propagation
    },
  },
});
```

### Encryption Providers

By default, Pulumi uses its service for encryption. For self-managed:

```bash
# Use AWS KMS
pulumi stack init production --secrets-provider="awskms://alias/pulumi-secrets"

# Use local passphrase
pulumi stack init production --secrets-provider="passphrase"
```

---

## GitHub Actions Secrets

### Setting Secrets

**Via GitHub UI:**

1. Repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add name and value

**Via GitHub CLI:**

```bash
gh secret set AWS_ROLE_TO_ASSUME --body "arn:aws:iam::123456789012:role/GitHubActionsRole"
gh secret set PULUMI_ACCESS_TOKEN --body "pul-xxxxxxxxxxxx"
```

### Required Secrets

| Secret | Purpose |
|--------|---------|
| `AWS_REGION` | AWS region for deployment |
| `AWS_ACCOUNT_ID` | AWS account ID |
| `AWS_ROLE_TO_ASSUME` | IAM role ARN for OIDC |
| `PULUMI_ACCESS_TOKEN` | Pulumi service authentication |
| `DATABASE_URL` | Database connection string |
| `CONTROL_PLANE_API_KEY` | Control plane API authentication |
| `VPN_TOKEN` | Bootstrap token for VPN nodes |
| `DESKTOP_S3_BUCKET` | S3 bucket for desktop releases |

### Environment-Specific Secrets

Use GitHub Environments for staging vs production:

```yaml
jobs:
  deploy:
    environment: production  # Uses production secrets
    steps:
      - name: Deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

## Local Development

### Environment Files

```bash
# Project structure
.env                 # Shared defaults (committed, no secrets!)
.env.local           # Local overrides (gitignored)
apps/web/.env.local  # Web app specific (gitignored)
```

### Sample .env.local

```bash
# Database (local Docker or Neon dev branch)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vpnvpn"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="development-secret-do-not-use-in-prod"

# OAuth (use test apps)
GITHUB_ID="test-github-app-id"
GITHUB_SECRET="test-github-app-secret"

# Stripe (use test mode keys)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Resend (use test API key or skip)
RESEND_API_KEY=""

# Control Plane (local Docker)
CONTROL_PLANE_API_URL="http://localhost:4000"
CONTROL_PLANE_API_KEY="local-dev-key"
CONTROL_PLANE_BOOTSTRAP_TOKEN="local-bootstrap-token"
```

### Never Commit Secrets Checklist

Before committing, verify:

- [ ] No `.env.local` files staged
- [ ] No hardcoded API keys in code
- [ ] No database URLs with passwords
- [ ] No private keys or certificates
- [ ] `.gitignore` includes all secret files

```bash
# Check for accidentally staged secrets
git diff --staged | grep -E "(sk_|whsec_|re_|password|secret)" 
```

---

## Secret Rotation

### Rotation Schedule

| Secret Type | Rotation Frequency | Method |
|-------------|-------------------|--------|
| Database credentials | 90 days | AWS Secrets Manager auto-rotation |
| API keys | 180 days | Manual rotation with overlap |
| OAuth secrets | Yearly | Provider dashboard |
| VPN node tokens | On compromise | Admin panel revoke/create |
| NEXTAUTH_SECRET | Never (unless compromised) | Invalidates all sessions |

### Rotation Procedure

**1. Generate New Secret**

```bash
# Generate random key
openssl rand -base64 32
```

**2. Update in All Locations**

- Vercel environment variables
- AWS Parameter Store / Secrets Manager
- Pulumi stack configuration
- GitHub Actions secrets

**3. Deploy with New Secret**

```bash
# Deploy web app
vercel --prod

# Deploy infrastructure
cd infra/pulumi && pulumi up
```

**4. Verify and Remove Old Secret**

- Monitor logs for authentication errors
- Remove old secret after 24-48 hours

---

## Security Best Practices

### Do's

- Use different secrets for each environment
- Rotate secrets regularly
- Use IAM roles instead of long-lived credentials
- Encrypt secrets at rest (Secrets Manager, Parameter Store SecureString)
- Audit secret access via CloudTrail
- Use least-privilege IAM policies

### Don'ts

- Never commit secrets to git
- Never log secrets (even accidentally)
- Never share secrets via Slack/email
- Never use production secrets in development
- Never hardcode secrets in source code
- Never store secrets in frontend code (NEXT_PUBLIC_ vars are public!)

### Monitoring

**Set up alerts for:**

- Secrets Manager secret access
- Parameter Store parameter access
- IAM credential usage
- Failed authentication attempts

```bash
# CloudWatch Logs Insights query for secret access
fields @timestamp, @message
| filter eventSource = "secretsmanager.amazonaws.com"
| filter eventName = "GetSecretValue"
| sort @timestamp desc
| limit 100
```

### Incident Response

If a secret is compromised:

1. **Immediately rotate** the compromised secret
2. **Audit access logs** for unauthorized usage
3. **Check for data exfiltration** if database credentials
4. **Revoke all sessions** if auth secret (NEXTAUTH_SECRET)
5. **Notify affected users** if user data was potentially exposed
6. **Document incident** and update procedures

---

## Quick Reference

### Generate Secrets

```bash
# NEXTAUTH_SECRET (32 bytes)
openssl rand -base64 32

# API Key (URL-safe)
openssl rand -base64 32 | tr '+/' '-_'

# UUID-style token
uuidgen | tr '[:upper:]' '[:lower:]'
```

### Verify Secret Configuration

```bash
# Vercel
vercel env ls

# AWS Parameter Store
aws ssm get-parameters-by-path --path /vpnvpn/production --with-decryption

# Pulumi
pulumi config --show-secrets

# GitHub (can't view values, only names)
gh secret list
```




