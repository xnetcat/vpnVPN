# Certificate and Key Rotation Guide

This document covers the rotation procedures for certificates, keys, and tokens in vpnVPN.

---

## Table of Contents

1. [Overview](#overview)
2. [ACM Certificates](#acm-certificates)
3. [WireGuard Keys](#wireguard-keys)
4. [VPN Node Tokens](#vpn-node-tokens)
5. [OAuth Credentials](#oauth-credentials)
6. [API Keys](#api-keys)
7. [Monitoring](#monitoring)
8. [Automation](#automation)

---

## Overview

### Rotation Schedule

| Credential Type | Rotation Frequency | Auto-Renew | Alert Threshold |
|-----------------|-------------------|------------|-----------------|
| ACM Certificates | Auto (every ~60 days) | Yes | 30 days before expiry |
| WireGuard Server Keys | On compromise only | No | N/A |
| WireGuard Client Keys | Per device registration | N/A | N/A |
| VPN Node Tokens | Annual or on compromise | No | 30 days before planned |
| OAuth Secrets | Annual | No | 30 days before planned |
| API Keys | Annual or on compromise | No | 30 days before planned |
| NEXTAUTH_SECRET | On compromise only | No | N/A |

---

## ACM Certificates

### Automatic Renewal

AWS Certificate Manager (ACM) automatically renews certificates if:
- DNS validation records are still in place
- Certificate is in use by AWS services (NLB, API Gateway, CloudFront)

### Check Certificate Status

```bash
# List all certificates
aws acm list-certificates --region us-east-1

# Get certificate details
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID \
  --query 'Certificate.{Status:Status,NotAfter:NotAfter,RenewalEligibility:RenewalEligibility}'
```

### Manual Certificate Request

If automatic renewal fails:

```bash
# Request new certificate
aws acm request-certificate \
  --domain-name api.vpnvpn.com \
  --validation-method DNS \
  --region us-east-1

# Get validation records
aws acm describe-certificate \
  --certificate-arn NEW_CERT_ARN \
  --query 'Certificate.DomainValidationOptions'

# Add CNAME records to DNS
# Wait for validation...

# Update resources to use new certificate
# (API Gateway, NLB, etc.)
```

### Certificate Monitoring

Set up CloudWatch alarm for certificate expiration:

```bash
# Create alarm (fires 30 days before expiry)
aws cloudwatch put-metric-alarm \
  --alarm-name acm-certificate-expiry \
  --metric-name DaysToExpiry \
  --namespace AWS/CertificateManager \
  --dimensions Name=CertificateArn,Value=CERT_ARN \
  --threshold 30 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 1 \
  --period 86400 \
  --statistic Minimum \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:alerts
```

---

## WireGuard Keys

### Server Key Management

WireGuard server keys are generated when the VPN node starts and persisted locally. Rotation requires careful coordination.

#### When to Rotate

- Security incident or suspected key compromise
- Periodic rotation (optional, every 1-2 years)
- Never rotate without planning

#### Rotation Procedure

1. **Prepare New Key**
   ```bash
   # Generate new keypair
   wg genkey | tee server_private.key | wg pubkey > server_public.key
   ```

2. **Update Infrastructure**
   ```bash
   # Update environment variable
   NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY=<new-public-key>
   ```

3. **Rolling Update**
   ```bash
   # Deploy to staging first
   # Allow 24 hours for client migrations
   
   # Deploy new VPN nodes with new keys
   # Old nodes continue serving existing connections
   ```

4. **Client Migration**
   - Notify users to regenerate device configs
   - Old configs will stop working after server rotation
   - Provide grace period (24-48 hours)

5. **Complete Rotation**
   ```bash
   # Remove old nodes from rotation
   # Update DNS if needed
   ```

### Client Key Management

Client keys are generated per-device and managed automatically:

1. User registers new device → New keypair generated
2. Old device revoked → Peer removed from all servers
3. No manual rotation needed

---

## VPN Node Tokens

### Token Lifecycle

Tokens authenticate VPN nodes with the control plane.

```
Create Token → Deploy to Nodes → Active Usage → Revoke → Delete
```

### Create New Token

Via Admin Panel:
1. Login as admin
2. Admin → Token Management
3. Click "Create Token"
4. Enter descriptive label (e.g., `us-east-1-prod-2024`)
5. Copy token securely

Via API:
```bash
curl -X POST https://api.vpnvpn.com/tokens \
  -H "x-api-key: ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"label": "us-east-1-prod-2024"}'
```

### Token Rotation Procedure

1. **Create New Token**
   ```bash
   # Via admin panel or API
   # Save new token securely
   ```

2. **Deploy New Token to Nodes**
   ```bash
   # Update Pulumi config
   cd infra/pulumi
   pulumi config set --secret vpnToken "new-token-value"
   
   # Rolling deploy (one region at a time)
   for stack in region-us-east-1 region-eu-west-1 region-ap-southeast-1; do
     pulumi stack select $stack
     pulumi up -y
     sleep 300  # Wait 5 minutes between regions
   done
   ```

3. **Verify New Token Working**
   ```bash
   # Check node registration with new token
   curl -s -H "x-api-key: API_KEY" \
     https://api.vpnvpn.com/servers | jq '.[].lastSeen'
   ```

4. **Revoke Old Token**
   ```bash
   # Via admin panel or API
   curl -X DELETE "https://api.vpnvpn.com/tokens/OLD_TOKEN" \
     -H "x-api-key: ADMIN_API_KEY"
   ```

### Emergency Token Revocation

If token is compromised:

```bash
# 1. Immediately revoke compromised token
curl -X DELETE "https://api.vpnvpn.com/tokens/COMPROMISED_TOKEN" \
  -H "x-api-key: ADMIN_API_KEY"

# 2. Create new token
# 3. Deploy to all regions immediately
# 4. Audit logs for unauthorized usage
```

---

## OAuth Credentials

### GitHub OAuth

1. **Create New OAuth App**
   - GitHub Settings → Developer settings → OAuth Apps → New
   - Set callback URL: `https://vpnvpn.com/api/auth/callback/github`
   - Save Client ID and Secret

2. **Update Vercel**
   ```bash
   vercel env add GITHUB_ID production
   vercel env add GITHUB_SECRET production
   ```

3. **Deploy**
   ```bash
   vercel --prod
   ```

4. **Remove Old App**
   - After 24 hours, delete old OAuth app in GitHub

### Google OAuth

1. **Create New Credentials**
   - Google Cloud Console → APIs & Services → Credentials
   - Create OAuth client ID (Web application)
   - Add redirect URI: `https://vpnvpn.com/api/auth/callback/google`

2. **Update Vercel**
   ```bash
   vercel env add GOOGLE_CLIENT_ID production
   vercel env add GOOGLE_CLIENT_SECRET production
   ```

3. **Deploy and Remove Old Credentials**

---

## API Keys

### Control Plane API Key

Used for web app → control plane communication.

#### Rotation Procedure

1. **Generate New Key**
   ```bash
   # Generate secure random key
   NEW_KEY=$(openssl rand -base64 32 | tr '+/' '-_')
   echo $NEW_KEY
   ```

2. **Update Control Plane (Lambda)**
   ```bash
   cd infra/pulumi
   pulumi stack select global
   pulumi config set --secret controlPlaneApiKey "$NEW_KEY"
   pulumi up -y
   ```

3. **Update Web App (Vercel)**
   ```bash
   vercel env add CONTROL_PLANE_API_KEY production
   # Enter new key when prompted
   vercel --prod
   ```

4. **Verify**
   ```bash
   curl -s -H "x-api-key: $NEW_KEY" \
     https://api.vpnvpn.com/servers
   ```

### Stripe Keys

Stripe keys should rarely need rotation. If compromised:

1. **Stripe Dashboard** → Developers → API keys → Roll keys
2. Update `STRIPE_SECRET_KEY` in Vercel
3. Create new webhook endpoint, update `STRIPE_WEBHOOK_SECRET`
4. Deploy immediately

### Resend API Key

1. **Resend Dashboard** → API Keys → Create new key
2. Update `RESEND_API_KEY` in Vercel
3. Deploy
4. Delete old key in Resend

---

## Monitoring

### Certificate Expiration Monitoring

```yaml
# CloudWatch alarm for ACM certificates
AlarmName: certificate-expiring-soon
Metrics:
  - Name: DaysToExpiry
    Namespace: AWS/CertificateManager
Threshold: 30
ComparisonOperator: LessThanThreshold
```

### Token Usage Monitoring

```sql
-- Query token usage in database
SELECT 
  token,
  label,
  "usageCount",
  "createdAt",
  active
FROM "VpnToken"
ORDER BY "usageCount" DESC;

-- Detect suspicious usage patterns
SELECT 
  date_trunc('hour', "updatedAt") as hour,
  COUNT(*) as registrations
FROM "VpnServer"
GROUP BY hour
ORDER BY registrations DESC;
```

### Rotation Reminder System

Create CloudWatch Events rules:

```bash
# Annual API key rotation reminder
aws events put-rule \
  --name api-key-rotation-reminder \
  --schedule-expression "cron(0 9 1 1 ? *)" \
  --description "Annual reminder to rotate API keys"

aws events put-targets \
  --rule api-key-rotation-reminder \
  --targets "Id"="1","Arn"="arn:aws:sns:us-east-1:ACCOUNT:ops-alerts"
```

---

## Automation

### Automated Certificate Monitoring Script

```bash
#!/bin/bash
# check-certificates.sh

THRESHOLD_DAYS=30
ALERT_SNS_TOPIC="arn:aws:sns:us-east-1:ACCOUNT:alerts"

for cert_arn in $(aws acm list-certificates --query 'CertificateSummaryList[].CertificateArn' --output text); do
  expiry=$(aws acm describe-certificate \
    --certificate-arn "$cert_arn" \
    --query 'Certificate.NotAfter' \
    --output text)
  
  expiry_epoch=$(date -d "$expiry" +%s)
  now_epoch=$(date +%s)
  days_remaining=$(( (expiry_epoch - now_epoch) / 86400 ))
  
  if [ $days_remaining -lt $THRESHOLD_DAYS ]; then
    domain=$(aws acm describe-certificate \
      --certificate-arn "$cert_arn" \
      --query 'Certificate.DomainName' \
      --output text)
    
    aws sns publish \
      --topic-arn "$ALERT_SNS_TOPIC" \
      --message "Certificate for $domain expires in $days_remaining days" \
      --subject "Certificate Expiration Warning"
  fi
done
```

### Automated Token Rotation Script

```bash
#!/bin/bash
# rotate-vpn-token.sh

set -e

CONTROL_PLANE_URL="https://api.vpnvpn.com"
API_KEY="$ADMIN_API_KEY"
LABEL_PREFIX="vpn-node-$(date +%Y%m)"

echo "Creating new token..."
NEW_TOKEN=$(curl -s -X POST "$CONTROL_PLANE_URL/tokens" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"label\": \"$LABEL_PREFIX\"}" | jq -r '.token')

echo "New token created: $LABEL_PREFIX"

# Update Pulumi config
cd infra/pulumi
pulumi config set --secret vpnToken "$NEW_TOKEN"

# Deploy to regions
for stack in region-us-east-1 region-eu-west-1 region-ap-southeast-1; do
  echo "Deploying to $stack..."
  pulumi stack select $stack
  pulumi up -y
  
  echo "Waiting for nodes to register..."
  sleep 120
  
  # Verify nodes registered
  REGISTERED=$(curl -s -H "x-api-key: $API_KEY" \
    "$CONTROL_PLANE_URL/servers" | jq 'length')
  echo "Registered servers: $REGISTERED"
done

echo "Token rotation complete"
echo "Remember to revoke old token after verification"
```

---

## Quick Reference

### Generate Secure Keys

```bash
# 32-byte base64 key
openssl rand -base64 32

# URL-safe key
openssl rand -base64 32 | tr '+/' '-_'

# UUID
uuidgen | tr '[:upper:]' '[:lower:]'
```

### Check Expiration

```bash
# ACM Certificate
aws acm describe-certificate --certificate-arn ARN \
  --query 'Certificate.NotAfter'

# View all tokens
curl -s -H "x-api-key: KEY" \
  https://api.vpnvpn.com/tokens | jq '.[] | {label, createdAt, active}'
```

### Emergency Contacts

| Credential Type | Owner | Emergency Action |
|-----------------|-------|------------------|
| ACM Certificates | Platform Team | Request new cert |
| VPN Tokens | Platform Team | Create + deploy |
| Stripe Keys | Finance/Platform | Roll keys in Stripe |
| OAuth Secrets | Platform Team | Create new OAuth app |
| Database URL | Platform Team | Contact Neon support |




