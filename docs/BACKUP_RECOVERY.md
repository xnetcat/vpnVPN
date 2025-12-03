# Backup and Disaster Recovery

This document outlines backup procedures, recovery processes, and disaster recovery planning for vpnVPN.

---

## Table of Contents

1. [Overview](#overview)
2. [Database Backup](#database-backup)
3. [Infrastructure Recovery](#infrastructure-recovery)
4. [Secret Recovery](#secret-recovery)
5. [Application Recovery](#application-recovery)
6. [Disaster Recovery Plan](#disaster-recovery-plan)
7. [Testing Procedures](#testing-procedures)

---

## Overview

### Recovery Objectives

| Metric | Target | Description |
|--------|--------|-------------|
| **RTO** (Recovery Time Objective) | 4 hours | Maximum acceptable downtime |
| **RPO** (Recovery Point Objective) | 1 hour | Maximum acceptable data loss |

### Critical Components

| Component | Criticality | Backup Method | Recovery Time |
|-----------|-------------|---------------|---------------|
| Database (Neon) | Critical | Automated snapshots | 30 min |
| Pulumi State | Critical | Pulumi Cloud | 15 min |
| Application Code | High | Git (GitHub) | 5 min |
| Secrets | Critical | AWS Secrets Manager | 30 min |
| Lambda Functions | High | S3 + Pulumi | 30 min |
| VPN Nodes | Medium | ASG auto-recovery | 5 min |

---

## Database Backup

### Neon Automated Backups

Neon provides automatic point-in-time recovery (PITR) with the following retention:

| Plan | Retention | PITR Window |
|------|-----------|-------------|
| Free | 7 days | 7 days |
| Pro | 30 days | 30 days |
| Enterprise | Custom | Custom |

### Manual Backup

#### Export Database

```bash
# Full database export
pg_dump $DATABASE_URL -F c -f vpnvpn_backup_$(date +%Y%m%d_%H%M%S).dump

# Data-only export (no schema)
pg_dump $DATABASE_URL --data-only -f vpnvpn_data_$(date +%Y%m%d).sql

# Schema-only export
pg_dump $DATABASE_URL --schema-only -f vpnvpn_schema.sql
```

#### Upload to S3

```bash
# Upload backup to S3
aws s3 cp vpnvpn_backup_*.dump s3://vpnvpn-backups/database/

# List backups
aws s3 ls s3://vpnvpn-backups/database/
```

### Automated Backup Script

```bash
#!/bin/bash
# backup-database.sh

set -e

BACKUP_DIR="/tmp/backups"
S3_BUCKET="vpnvpn-backups"
RETENTION_DAYS=30

mkdir -p $BACKUP_DIR

# Create backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/vpnvpn_$TIMESTAMP.dump"

echo "Creating backup: $BACKUP_FILE"
pg_dump $DATABASE_URL -F c -f $BACKUP_FILE

# Compress
gzip $BACKUP_FILE

# Upload to S3
echo "Uploading to S3..."
aws s3 cp ${BACKUP_FILE}.gz s3://$S3_BUCKET/database/

# Cleanup old local backups
find $BACKUP_DIR -name "*.dump.gz" -mtime +7 -delete

# Cleanup old S3 backups (lifecycle policy recommended instead)
echo "Backup complete: ${BACKUP_FILE}.gz"
```

### Restore from Backup

#### Point-in-Time Recovery (Neon)

1. Go to Neon Dashboard → Project → Branches
2. Click "Create Branch"
3. Select "From a point in time"
4. Choose timestamp before data loss
5. Create branch and verify data
6. Promote branch if needed (or update connection string)

#### Restore from Dump

```bash
# Create new database
createdb -h HOST -U USER vpnvpn_restored

# Restore from dump
pg_restore -h HOST -U USER -d vpnvpn_restored vpnvpn_backup.dump

# Or restore from SQL
psql -h HOST -U USER -d vpnvpn_restored -f vpnvpn_data.sql
```

---

## Infrastructure Recovery

### Pulumi State Backup

Pulumi state is stored in Pulumi Cloud by default. For additional protection:

```bash
# Export state
pulumi stack export --stack production > pulumi_state_production.json
pulumi stack export --stack region-us-east-1 > pulumi_state_region_us_east_1.json

# Upload to S3
aws s3 cp pulumi_state_*.json s3://vpnvpn-backups/pulumi/
```

### Recover Infrastructure

#### Scenario 1: Pulumi Cloud Available

```bash
cd infra/pulumi
pulumi login  # Already connected to cloud state

# Refresh to sync with actual resources
pulumi stack select global
pulumi refresh

# Redeploy if needed
pulumi up -y
```

#### Scenario 2: Restore from Exported State

```bash
# Create new stack
pulumi stack init production-restored

# Import state
pulumi stack import < pulumi_state_production.json

# Refresh and verify
pulumi refresh
pulumi preview
```

### Recreate from Scratch

If both Pulumi state and resources are lost:

```bash
cd infra/pulumi

# 1. Deploy global stack
pulumi stack select global --create
pulumi config set aws:region us-east-1
pulumi config set --secret databaseUrl "$DATABASE_URL"
pulumi config set --secret controlPlaneApiKey "$CONTROL_PLANE_API_KEY"
pulumi up -y

# 2. Build and push VPN server image
cd apps/vpn-server
docker build -t vpn-server:latest .
docker tag vpn-server:latest $ECR_URI:latest
docker push $ECR_URI:latest

# 3. Deploy regional stacks
cd infra/pulumi
for region in us-east-1 eu-west-1 ap-southeast-1; do
  pulumi stack select region-$region --create
  pulumi config set aws:region $region
  pulumi config set region:imageTag latest
  pulumi config set region:minInstances 1
  pulumi config set region:maxInstances 10
  pulumi up -y
done
```

---

## Secret Recovery

### Backup Secrets

```bash
# Export secrets to encrypted file (use strong passphrase)
aws secretsmanager get-secret-value \
  --secret-id vpnvpn/production/database \
  --query SecretString --output text > secrets_database.txt

# Encrypt before storing
gpg --symmetric --cipher-algo AES256 secrets_database.txt
rm secrets_database.txt

# Store encrypted backup
aws s3 cp secrets_database.txt.gpg s3://vpnvpn-backups/secrets/
```

### Restore Secrets

```bash
# Download encrypted backup
aws s3 cp s3://vpnvpn-backups/secrets/secrets_database.txt.gpg .

# Decrypt
gpg --decrypt secrets_database.txt.gpg > secrets_database.txt

# Restore to Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id vpnvpn/production/database \
  --secret-string file://secrets_database.txt

# Clean up
rm secrets_database.txt secrets_database.txt.gpg
```

### Secret Inventory

Maintain a list of all secrets (names only, not values):

| Secret Name | Location | Purpose |
|-------------|----------|---------|
| `DATABASE_URL` | Vercel, Lambda | Database connection |
| `NEXTAUTH_SECRET` | Vercel | Session encryption |
| `STRIPE_SECRET_KEY` | Vercel | Payment processing |
| `STRIPE_WEBHOOK_SECRET` | Vercel | Webhook verification |
| `RESEND_API_KEY` | Vercel | Email sending |
| `CONTROL_PLANE_API_KEY` | Vercel, Lambda | Internal API auth |
| `VPN_TOKEN` | VPN Nodes | Node authentication |
| OAuth Secrets | Vercel | GitHub, Google OAuth |

---

## Application Recovery

### Web App (Vercel)

The web app is automatically deployed from Git. To recover:

1. **Verify Git Repository**
   ```bash
   git clone https://github.com/your-org/vpnvpn.git
   cd vpnvpn
   git checkout main  # or staging
   ```

2. **Redeploy via Vercel**
   ```bash
   vercel --prod
   ```

3. **Verify Environment Variables**
   ```bash
   vercel env ls
   # Re-add any missing variables
   ```

### Lambda Functions

Lambda functions are deployed via Pulumi:

```bash
cd infra/pulumi
pulumi stack select global

# Redeploy functions
pulumi up -y --target "aws:lambda/function:*"
```

### VPN Nodes

VPN nodes auto-recover via ASG:

```bash
# Check ASG health
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names vpnvpn-asg

# Force instance refresh
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name vpnvpn-asg \
  --preferences '{"MinHealthyPercentage": 50}'
```

---

## Disaster Recovery Plan

### Scenario 1: Database Corruption

**Detection**: Data inconsistencies, application errors

**Response**:
1. Immediately pause all writes (disable webhooks, API)
2. Assess extent of corruption
3. Identify last known good state
4. Restore from Neon PITR to that point
5. Update connection string if using new branch
6. Re-enable services and monitor

**Timeline**: 30-60 minutes

### Scenario 2: AWS Region Failure

**Detection**: CloudWatch alarms, health checks fail

**Response**:
1. Confirm region outage (AWS status page)
2. Route traffic away from affected region (DNS/NLB)
3. Scale up capacity in healthy regions
4. Wait for region recovery or rebuild infrastructure

**Timeline**: 15-30 minutes (traffic reroute), 2-4 hours (rebuild)

### Scenario 3: Complete Data Loss

**Detection**: Database empty, backups needed

**Response**:
1. Assess available backups (Neon PITR, S3 dumps)
2. Provision new database
3. Restore from most recent backup
4. Update connection strings
5. Verify data integrity
6. Resume services

**Timeline**: 1-4 hours depending on data size

### Scenario 4: Secret Compromise

**Detection**: Unauthorized access, suspicious activity

**Response**:
1. **Immediately** rotate compromised secrets
2. Revoke all VPN tokens
3. Invalidate all user sessions (rotate NEXTAUTH_SECRET)
4. Review access logs for unauthorized actions
5. Notify affected users if data was accessed
6. Conduct post-incident review

**Timeline**: 1-2 hours (immediate response), ongoing (investigation)

### Scenario 5: Vercel Outage

**Detection**: Web app unreachable, Vercel status page

**Response**:
1. Monitor Vercel status
2. If prolonged (>1 hour), consider emergency alternatives:
   - Deploy Next.js to AWS Lambda
   - Serve static landing page from S3
3. Communicate with users via status page

**Timeline**: Wait for Vercel (usually <1 hour)

---

## Testing Procedures

### Quarterly DR Tests

#### Test 1: Database Recovery

```bash
# 1. Create test data
INSERT INTO "TestTable" (data) VALUES ('DR Test $(date)');

# 2. Restore to point before insert
# Use Neon PITR to create branch

# 3. Verify test data is NOT present (proves PITR works)

# 4. Clean up test branch
```

#### Test 2: Infrastructure Recreation

```bash
# 1. Export current Pulumi state
pulumi stack export --stack production > pre_test_state.json

# 2. Destroy and recreate (in staging only!)
pulumi destroy -y
pulumi up -y

# 3. Verify all resources created
pulumi stack output

# 4. Run health checks
curl https://api-staging.vpnvpn.com/health
```

#### Test 3: Secret Recovery

```bash
# 1. Document current secret versions
aws secretsmanager describe-secret --secret-id vpnvpn/staging/test

# 2. Rotate secret
aws secretsmanager rotate-secret --secret-id vpnvpn/staging/test

# 3. Verify application continues to function

# 4. Restore previous version if needed (for testing)
```

### Monthly Health Checks

- [ ] Verify Neon PITR is working (create test branch)
- [ ] Verify S3 backup bucket is accessible
- [ ] Verify Pulumi state export works
- [ ] Check backup retention policies
- [ ] Review CloudWatch alarms
- [ ] Test runbook procedures

---

## Recovery Contacts

| Role | Contact | Responsibility |
|------|---------|----------------|
| On-Call Engineer | PagerDuty | Initial response |
| Platform Lead | Slack/Phone | Infrastructure decisions |
| Security Lead | Slack/Phone | Breach response |
| Database Admin | Slack/Phone | Data recovery |

### External Support

| Service | Support URL | SLA |
|---------|-------------|-----|
| Neon | support.neon.tech | Based on plan |
| Vercel | vercel.com/support | Based on plan |
| AWS | aws.amazon.com/support | Based on plan |
| Stripe | support.stripe.com | Business hours |

---

## Appendix: Backup Schedule

| Data | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Database (PITR) | Continuous | 30 days | Neon |
| Database (Manual) | Weekly | 90 days | S3 |
| Pulumi State | On change | Unlimited | Pulumi Cloud |
| Pulumi Export | Weekly | 90 days | S3 |
| Secrets Export | Monthly | 1 year | S3 (encrypted) |
| Application Logs | Continuous | 14 days | CloudWatch |




