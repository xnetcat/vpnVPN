# Production Setup Guide

This guide covers the configuration steps required to deploy vpnVPN to production.

## Prerequisites

- Vercel account with project configured
- AWS account with appropriate IAM permissions
- Stripe account with products/prices created
- Resend account
- Domain name (e.g., `vpnvpn.com`)
- Neon database (or PostgreSQL)

---

## 1. Stripe Webhooks Configuration

### Overview

Stripe webhooks notify vpnVPN of billing events (subscriptions, payments, cancellations). The webhook endpoint is `/api/webhooks/stripe`.

### Required Events

Configure Stripe to send these events:

| Event | Purpose |
|-------|---------|
| `checkout.session.completed` | New subscription created via Checkout |
| `customer.subscription.created` | Subscription record created |
| `customer.subscription.updated` | Plan changes, renewals, status updates |
| `customer.subscription.deleted` | Cancellations, revokes VPN access |
| `invoice.payment_succeeded` | Payment confirmation (optional) |
| `invoice.payment_failed` | Payment failure alerts (optional) |

### Setup Steps

1. **Go to Stripe Dashboard** → Developers → Webhooks

2. **Add Endpoint**
   - URL: `https://your-domain.com/api/webhooks/stripe`
   - Select events listed above

3. **Copy Signing Secret**
   - After creating the endpoint, reveal the signing secret (`whsec_...`)
   - Set as `STRIPE_WEBHOOK_SECRET` in Vercel

4. **Verify Webhook**
   - Use Stripe CLI for local testing:
     ```bash
     stripe listen --forward-to localhost:3000/api/webhooks/stripe
     ```
   - Trigger a test event:
     ```bash
     stripe trigger checkout.session.completed
     ```

### Environment Variables

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_BASIC=price_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_ENTERPRISE=price_...
```

### Webhook Behavior

When events are received:

- **checkout.session.completed**: Creates/updates subscription record, sends welcome email
- **customer.subscription.updated**: Updates tier and status
- **customer.subscription.deleted**: Revokes all VPN peers for user, sends cancellation email

---

## 2. Resend Sender Domain Setup

### Overview

Resend handles transactional emails (magic links, notifications). A verified sender domain improves deliverability.

### Email Templates Used

| Template | Trigger |
|----------|---------|
| `welcome` | New user signup |
| `magic_link` | Email authentication |
| `subscription_active` | Successful subscription |
| `subscription_cancelled` | Subscription ended |
| `device_added` | New device registered |
| `device_revoked` | Device removed |

### DNS Configuration

1. **Go to Resend Dashboard** → Domains → Add Domain

2. **Add DNS Records** (provided by Resend):

   ```
   # SPF Record
   Type: TXT
   Host: @
   Value: v=spf1 include:_spf.resend.com ~all

   # DKIM Record
   Type: TXT
   Host: resend._domainkey
   Value: (provided by Resend)

   # DMARC Record (recommended)
   Type: TXT
   Host: _dmarc
   Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@your-domain.com
   ```

3. **Verify Domain** in Resend dashboard (may take up to 48 hours)

4. **Update FROM Address**:
   ```bash
   EMAIL_FROM=noreply@your-domain.com
   ```

### Environment Variables

```bash
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@vpnvpn.com
```

### Testing

Send a test email via Resend dashboard or trigger a magic link login to verify delivery.

---

## 3. VPN Node Token Management

### Overview

VPN nodes authenticate with the control plane using bearer tokens. Tokens are managed via the admin panel.

### Creating Production Tokens

1. **Login as Admin** to the web dashboard

2. **Navigate to Admin** → Token Management

3. **Create Token**:
   - Label: Use descriptive names (e.g., `us-east-1-prod-01`)
   - Copy the generated token securely

4. **Deploy Token to VPN Node**:
   ```bash
   # Set in node environment
   VPN_TOKEN=your-generated-token
   CONTROL_PLANE_URL=https://api.vpnvpn.com
   ```

### Token Security Best Practices

- Generate unique tokens per node or per region
- Store tokens in AWS Secrets Manager or Parameter Store
- Rotate tokens periodically (see Certificate Rotation guide)
- Revoke tokens immediately if compromised

### Bootstrap Token (Development)

For initial deployment, a bootstrap token can be set via environment:

```bash
CONTROL_PLANE_BOOTSTRAP_TOKEN=initial-setup-token
```

This token is auto-created on control plane startup if set.

---

## 4. End-to-End Production Test Checklist

### Pre-Flight Checks

- [ ] All environment variables configured in Vercel
- [ ] Database migrations applied (`bunx prisma migrate deploy`)
- [ ] Stripe webhooks verified and active
- [ ] Resend domain verified
- [ ] VPN nodes registered and healthy
- [ ] SSL certificates valid

### Test Flow

#### Step 1: User Signup
- [ ] Visit production URL
- [ ] Click "Sign In" → Enter email
- [ ] Receive magic link email
- [ ] Click link → Successfully authenticated
- [ ] Welcome email received

#### Step 2: Subscription
- [ ] Navigate to pricing page
- [ ] Select a plan (e.g., Pro)
- [ ] Complete Stripe Checkout
- [ ] Redirected to dashboard
- [ ] Subscription shows as active
- [ ] Subscription active email received

#### Step 3: Device Registration
- [ ] Click "Add Device"
- [ ] Enter device name
- [ ] Select server (if applicable)
- [ ] Download WireGuard configuration
- [ ] Device added email received

#### Step 4: VPN Connection
- [ ] Import config into WireGuard client
- [ ] Activate VPN connection
- [ ] Verify handshake completes
- [ ] Check IP address changed (use `curl ifconfig.me`)
- [ ] Verify DNS resolution works

#### Step 5: Traffic Verification
- [ ] Browse websites normally
- [ ] Test streaming services (if applicable)
- [ ] Verify no DNS leaks (dnsleaktest.com)
- [ ] Check WebRTC leak protection

#### Step 6: Subscription Cancellation
- [ ] Navigate to Account → Manage Billing
- [ ] Cancel subscription in Stripe portal
- [ ] Verify subscription_cancelled email received
- [ ] Verify VPN connection stops working
- [ ] Verify peers revoked in control plane

### Monitoring Checklist

- [ ] CloudWatch logs showing traffic
- [ ] Grafana dashboards displaying metrics
- [ ] Error rates within acceptable limits
- [ ] Latency within acceptable limits

---

## 5. SSL Certificates for Custom Domains

### Vercel Custom Domain

1. **Add Domain in Vercel**:
   - Project Settings → Domains → Add
   - Enter your domain (e.g., `vpnvpn.com`, `www.vpnvpn.com`)

2. **Configure DNS**:
   ```
   # Apex domain
   Type: A
   Host: @
   Value: 76.76.21.21

   # www subdomain
   Type: CNAME
   Host: www
   Value: cname.vercel-dns.com
   ```

3. **Verify and Enable SSL**:
   - Vercel automatically provisions Let's Encrypt certificates
   - SSL is enforced by default

### API Gateway Custom Domain (Control Plane)

1. **Request Certificate in ACM**:
   ```bash
   aws acm request-certificate \
     --domain-name api.vpnvpn.com \
     --validation-method DNS \
     --region us-east-1
   ```

2. **Validate Certificate**:
   - Add CNAME record provided by ACM
   - Wait for validation (usually < 30 minutes)

3. **Create Custom Domain in API Gateway**:
   ```bash
   aws apigateway create-domain-name \
     --domain-name api.vpnvpn.com \
     --regional-certificate-arn arn:aws:acm:us-east-1:...
   ```

4. **Map to API**:
   - Create base path mapping to your API stage

5. **Update DNS**:
   ```
   Type: CNAME
   Host: api
   Value: (API Gateway regional domain name)
   ```

### NLB (VPN Endpoints) SSL/TLS

For VPN traffic, TLS termination happens at the WireGuard/OpenVPN level, not at the NLB. The NLB passes through encrypted UDP/TCP traffic.

For the admin API (port 8080), if exposed publicly:

1. **Request ACM Certificate** for `vpn.vpnvpn.com`

2. **Add TLS Listener to NLB**:
   ```bash
   aws elbv2 create-listener \
     --load-balancer-arn <nlb-arn> \
     --protocol TLS \
     --port 443 \
     --certificates CertificateArn=<acm-cert-arn> \
     --default-actions Type=forward,TargetGroupArn=<tg-arn>
   ```

### Certificate Monitoring

- ACM certificates auto-renew if validated via DNS
- Set up CloudWatch alarms for certificate expiration
- Monitor Vercel dashboard for any SSL issues

---

## Environment Variables Summary

### Vercel (apps/web)

```bash
# Database
DATABASE_URL=postgresql://...@neon.tech/vpnvpn

# Auth
NEXTAUTH_URL=https://vpnvpn.com
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>

# OAuth
GITHUB_ID=...
GITHUB_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Email
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@vpnvpn.com

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_BASIC=price_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_ENTERPRISE=price_...

# Control Plane
CONTROL_PLANE_API_URL=https://api.vpnvpn.com
CONTROL_PLANE_API_KEY=<secure-api-key>

# WireGuard
NEXT_PUBLIC_WG_ENDPOINT=vpn.vpnvpn.com:51820
NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY=<server-public-key>

# Desktop
NEXT_PUBLIC_DESKTOP_BUCKET_URL=https://vpnvpn-desktop-prod.s3.amazonaws.com
```

### AWS Lambda (Control Plane & Metrics)

```bash
DATABASE_URL=postgresql://...@neon.tech/vpnvpn
CONTROL_PLANE_API_KEY=<same-as-vercel>
```

### VPN Nodes

```bash
VPN_TOKEN=<node-specific-token>
CONTROL_PLANE_URL=https://api.vpnvpn.com
METRICS_URL=https://metrics.vpnvpn.com
REGION=us-east-1
```

---

## Troubleshooting

### Webhook Issues

- Check Stripe dashboard for failed webhook attempts
- Verify `STRIPE_WEBHOOK_SECRET` matches the endpoint
- Check Vercel function logs for errors

### Email Delivery Issues

- Verify domain in Resend dashboard
- Check spam folders
- Review Resend logs for bounces/complaints

### VPN Connection Issues

- Verify node is registered (`GET /servers`)
- Check peer exists (`GET /server/peers`)
- Verify WireGuard handshake in node logs

See `TROUBLESHOOTING.md` for detailed debugging steps.

