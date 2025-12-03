# Troubleshooting Guide

Comprehensive troubleshooting guide for vpnVPN issues.

---

## Table of Contents

1. [Connection Issues](#connection-issues)
2. [Control Plane Errors](#control-plane-errors)
3. [Billing Issues](#billing-issues)
4. [Desktop App Issues](#desktop-app-issues)
5. [Infrastructure Issues](#infrastructure-issues)
6. [Debug Tools](#debug-tools)

---

## Connection Issues

### Client Cannot Connect to VPN

#### Symptoms
- WireGuard shows "No recent handshake"
- Connection times out
- "Peer not found" errors

#### Diagnostic Steps

```bash
# 1. Verify server is reachable
ping vpn.vpnvpn.com
nc -zuv vpn.vpnvpn.com 51820

# 2. Check client configuration
cat /etc/wireguard/wg0.conf  # Or view in app

# 3. Verify server public key matches
curl -s http://NODE_IP:8080/pubkey

# 4. Check if peer is registered on server
curl -s -H "Authorization: Bearer TOKEN" \
  "https://api.vpnvpn.com/server/peers" | jq '.peers[] | select(.public_key == "CLIENT_PUBKEY")'
```

#### Common Causes & Solutions

| Cause | Solution |
|-------|----------|
| Incorrect server public key | Regenerate device config in dashboard |
| Peer not synced to server | Wait 30s for sync, or check control plane |
| Firewall blocking UDP 51820 | Open port in client firewall/router |
| NAT traversal issues | Try different network, check NAT-T settings |
| Server at capacity | Try different server region |

---

### Connected but No Internet

#### Symptoms
- VPN handshake succeeds
- Cannot reach any websites
- DNS resolution fails

#### Diagnostic Steps

```bash
# With VPN connected:

# 1. Check if tunnel is up
wg show

# 2. Test connectivity to VPN server internal
ping 10.8.0.1  # Server's VPN IP

# 3. Test external connectivity through tunnel
ping 1.1.1.1

# 4. Test DNS
nslookup google.com 1.1.1.1
```

#### Common Causes & Solutions

| Cause | Solution |
|-------|----------|
| DNS not configured | Add `DNS = 1.1.1.1` to [Interface] |
| AllowedIPs missing | Set `AllowedIPs = 0.0.0.0/0, ::/0` |
| Server NAT not configured | Check iptables on VPN node |
| MTU issues | Add `MTU = 1280` to [Interface] |

---

### Slow VPN Performance

#### Symptoms
- High latency
- Low bandwidth
- Frequent disconnections

#### Diagnostic Steps

```bash
# 1. Check latency to server
ping -c 10 vpn.vpnvpn.com

# 2. Measure bandwidth (without VPN)
speedtest-cli

# 3. Measure bandwidth (with VPN)
speedtest-cli

# 4. Check server load
curl -s http://NODE_IP:8080/status | jq '.[].active_sessions'
```

#### Common Causes & Solutions

| Cause | Solution |
|-------|----------|
| Distant server | Switch to closer region |
| Server overloaded | Try different server |
| ISP throttling | Try TCP-based VPN (OpenVPN) |
| MTU issues | Reduce MTU to 1280 |
| Encryption overhead | Use WireGuard (fastest) |

---

## Control Plane Errors

### Server Registration Failed

#### Symptoms
- VPN node logs: `registration_failed_retrying`
- Server not appearing in admin panel
- Peers not syncing

#### Diagnostic Steps

```bash
# 1. Test control plane health
curl -s https://api.vpnvpn.com/health | jq .

# 2. Verify token is valid
curl -X POST https://api.vpnvpn.com/server/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"test","publicKey":"test","listenPort":51820}'

# 3. Check token in admin panel (is it active?)

# 4. Check VPN node logs
docker logs vpn-node 2>&1 | grep -i register
```

#### Common Causes & Solutions

| Cause | Solution |
|-------|----------|
| Invalid/revoked token | Create new token in admin panel |
| Control plane unreachable | Check Lambda function status |
| Network connectivity | Verify outbound HTTPS allowed |
| Database connection | Check control plane CloudWatch logs |

---

### Peer Sync Failures

#### Symptoms
- VPN node logs: `peer_sync_request_failed`
- New devices can't connect
- Device revocation doesn't take effect

#### Diagnostic Steps

```bash
# 1. Manual peer fetch
curl -s -H "Authorization: Bearer YOUR_TOKEN" \
  "https://api.vpnvpn.com/server/peers?id=YOUR_SERVER_ID" | jq .

# 2. Check WireGuard interface
wg show wg0 peers

# 3. View sync loop timing
docker logs vpn-node 2>&1 | grep -i peer
```

#### Common Causes & Solutions

| Cause | Solution |
|-------|----------|
| Token expired/revoked | Create and deploy new token |
| Network timeout | Check Lambda timeout settings |
| Database issues | Check Neon dashboard for issues |
| Too many peers | Increase Lambda memory/timeout |

---

### API Key Authentication Failures

#### Symptoms
- Web app can't fetch servers
- 401 Unauthorized errors
- tRPC errors in browser console

#### Diagnostic Steps

```bash
# 1. Test API directly
curl -s -H "x-api-key: YOUR_API_KEY" \
  https://api.vpnvpn.com/servers

# 2. Verify key in Vercel env vars
vercel env ls

# 3. Check control plane logs
# AWS Console → CloudWatch → Log groups → /aws/lambda/control-plane
```

#### Common Causes & Solutions

| Cause | Solution |
|-------|----------|
| Key mismatch | Sync keys between Vercel and Lambda |
| Key not set | Add `CONTROL_PLANE_API_KEY` to Vercel |
| Wrong header | Use `x-api-key` (lowercase) |

---

## Billing Issues

### Webhook Not Processing

#### Symptoms
- Subscription not activated after payment
- Cancellation doesn't revoke access
- No emails sent

#### Diagnostic Steps

```bash
# 1. Check Stripe webhook dashboard
# Stripe Dashboard → Developers → Webhooks → Events

# 2. Verify webhook secret
# Compare STRIPE_WEBHOOK_SECRET in Vercel with Stripe dashboard

# 3. Check Vercel function logs
# Vercel Dashboard → Project → Functions → api/webhooks/stripe

# 4. Test webhook locally
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed
```

#### Common Causes & Solutions

| Cause | Solution |
|-------|----------|
| Wrong webhook secret | Update `STRIPE_WEBHOOK_SECRET` |
| Endpoint not configured | Add webhook in Stripe dashboard |
| Missing events | Enable all subscription events |
| Function timeout | Check for database issues |

---

### Subscription State Mismatch

#### Symptoms
- Dashboard shows wrong tier
- User can't access paid features
- "Active subscription required" error

#### Diagnostic Steps

```sql
-- Check subscription in database
SELECT * FROM "Subscription" WHERE "userId" = 'user_id';

-- Check Stripe subscription
-- Stripe Dashboard → Customers → Find customer → Subscriptions
```

#### Common Causes & Solutions

| Cause | Solution |
|-------|----------|
| Webhook missed | Manually sync from Stripe |
| Database out of sync | Re-trigger webhook event |
| Multiple subscriptions | Ensure one active sub per user |

---

### Payment Failed

#### Symptoms
- User charged but not activated
- Checkout completes but no subscription

#### Resolution

1. Check Stripe dashboard for payment status
2. If payment succeeded, manually create subscription record
3. If payment failed, advise user to retry or use different card
4. Check for fraud blocks in Stripe Radar

---

## Desktop App Issues

### Deep Links Not Working

#### Symptoms
- Clicking `vpnvpn://` links doesn't open app
- App opens but doesn't authenticate

#### Platform-Specific Fixes

**macOS:**
```bash
# Re-register URL handler
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -R -f /Applications/vpnVPN.app
```

**Windows:**
```powershell
# Check registry
reg query HKEY_CLASSES_ROOT\vpnvpn
```

**Linux:**
```bash
# Check .desktop file
cat ~/.local/share/applications/vpnvpn.desktop
xdg-mime query default x-scheme-handler/vpnvpn
```

---

### Desktop Login Code Not Working

#### Symptoms
- "Invalid code" error
- Code expired message
- No email received

#### Diagnostic Steps

```sql
-- Check code in database
SELECT * FROM "DesktopLoginCode" 
WHERE email = 'user@example.com' 
ORDER BY "createdAt" DESC;
```

#### Common Causes & Solutions

| Cause | Solution |
|-------|----------|
| Code expired (15 min) | Request new code |
| Code already used | Request new code |
| Wrong email | Check spelling |
| Email not delivered | Check spam, verify Resend |

---

### App Won't Build

#### Symptoms
- Tauri build fails
- Missing dependencies

#### Diagnostic Steps

```bash
# Check Rust toolchain
rustup show

# Check Tauri CLI
cargo tauri --version

# Check frontend deps
cd apps/desktop && bun install

# Verbose build
cargo tauri build --verbose
```

#### Platform-Specific Requirements

**macOS:**
```bash
xcode-select --install
```

**Windows:**
- Visual Studio Build Tools
- WebView2 Runtime

**Linux:**
```bash
sudo apt install libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf
```

---

## Infrastructure Issues

### Lambda Cold Starts

#### Symptoms
- First request takes 5-10 seconds
- Intermittent slow responses

#### Solutions

1. **Provisioned Concurrency** (cost increase):
   ```bash
   aws lambda put-provisioned-concurrency-config \
     --function-name control-plane \
     --provisioned-concurrent-executions 2
   ```

2. **Warm-up schedule**:
   ```bash
   # CloudWatch Events rule to ping every 5 minutes
   aws events put-rule --name warm-control-plane \
     --schedule-expression "rate(5 minutes)"
   ```

3. **Optimize bundle size**:
   - Review dependencies
   - Use tree shaking
   - Consider container image deployment

---

### ASG Not Scaling

#### Symptoms
- High session count but no new instances
- Instances stuck in pending

#### Diagnostic Steps

```bash
# Check scaling activities
aws autoscaling describe-scaling-activities \
  --auto-scaling-group-name vpnvpn-asg \
  --max-items 10

# Check CloudWatch alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix vpnvpn

# Check instance health
aws autoscaling describe-auto-scaling-instances
```

#### Common Causes & Solutions

| Cause | Solution |
|-------|----------|
| At max capacity | Increase `maxInstances` |
| Launch failures | Check EC2 quota, AMI access |
| Cooldown period | Wait or adjust cooldown |
| Alarm not triggering | Check metric publishing |

---

### Database Connection Issues

#### Symptoms
- "Connection refused" errors
- Timeouts on queries
- Lambda hitting max connections

#### Diagnostic Steps

```bash
# Check Neon status
# https://neon.tech/status

# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check connection count (Neon dashboard)
```

#### Solutions

1. **Enable connection pooling** (Neon):
   - Use pooled connection string
   - Change port to 5433

2. **Reduce Lambda concurrency**:
   ```bash
   aws lambda put-function-concurrency \
     --function-name control-plane \
     --reserved-concurrent-executions 20
   ```

3. **Implement connection retry**:
   ```typescript
   const prisma = new PrismaClient({
     datasources: {
       db: { url: process.env.DATABASE_URL }
     },
     // Connection retry logic handled by Prisma
   });
   ```

---

## Debug Tools

### Useful Commands

```bash
# Web app health
curl -s https://vpnvpn.com/api/health | jq .

# Control plane health
curl -s https://api.vpnvpn.com/health | jq .

# Metrics service health
curl -s https://metrics.vpnvpn.com/health | jq .

# VPN node health
curl -s http://NODE_IP:8080/health | jq .

# List all servers
curl -s -H "x-api-key: API_KEY" https://api.vpnvpn.com/servers | jq .

# Test WireGuard connectivity
wg show
ping 10.8.0.1
```

### Log Locations

| Component | Location |
|-----------|----------|
| Web App | Vercel Dashboard → Functions |
| Control Plane | CloudWatch → /aws/lambda/control-plane |
| Metrics Service | CloudWatch → /aws/lambda/metrics |
| VPN Node | CloudWatch → /vpnvpn/vpn-server or `docker logs` |

### CloudWatch Logs Insights Queries

```sql
-- Recent errors
fields @timestamp, @message
| filter @message like /error/i
| sort @timestamp desc
| limit 100

-- Registration events
fields @timestamp, @message
| filter @message like /register/i
| sort @timestamp desc
| limit 50

-- Slow requests (>3s)
fields @timestamp, @duration
| filter @duration > 3000
| sort @timestamp desc
| limit 50

-- Webhook processing
fields @timestamp, @message
| filter @message like /webhook/i or @message like /stripe/i
| sort @timestamp desc
| limit 100
```

### Browser Developer Tools

1. **Network Tab**: Check API responses, look for 4xx/5xx errors
2. **Console**: Look for tRPC errors, auth issues
3. **Application Tab**: Check cookies, local storage
4. **React DevTools**: Inspect component state

### Database Queries

```sql
-- Check user subscription
SELECT u.email, s.status, s.tier, s."currentPeriodEnd"
FROM "User" u
LEFT JOIN "Subscription" s ON u.id = s."userId"
WHERE u.email = 'user@example.com';

-- Check user devices
SELECT d.name, d."publicKey", d."createdAt"
FROM "Device" d
JOIN "User" u ON d."userId" = u.id
WHERE u.email = 'user@example.com';

-- Check VPN peers
SELECT "publicKey", "userId", "active", "serverId"
FROM "VpnPeer"
WHERE "userId" = 'user_id';

-- Check server registrations
SELECT id, status, "lastSeen", metadata
FROM "VpnServer"
ORDER BY "lastSeen" DESC;
```

---

## Escalation Path

1. **Level 1**: Check this guide, review logs
2. **Level 2**: Check CloudWatch metrics, database queries
3. **Level 3**: Review code, check recent deployments
4. **Level 4**: Infrastructure investigation, vendor support

### Information to Collect

- User ID / Email
- Timestamp of issue
- Error messages (exact text)
- Steps to reproduce
- Environment (production/staging)
- Client platform and version
- Recent changes to system




