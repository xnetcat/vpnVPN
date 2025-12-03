# VPN Node Deployment Runbook

This runbook covers the deployment, management, and troubleshooting of vpnVPN server nodes.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Methods](#deployment-methods)
4. [Health Verification](#health-verification)
5. [Scaling Operations](#scaling-operations)
6. [Monitoring](#monitoring)
7. [Maintenance Procedures](#maintenance-procedures)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### VPN Node Components

```
┌─────────────────────────────────────────────────────────────┐
│                        VPN Node                              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  WireGuard  │  │   OpenVPN   │  │    IKEv2    │         │
│  │  (51820/udp)│  │  (1194/udp) │  │ (500,4500)  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Admin API (8080/tcp)                       │ │
│  │  /health  /metrics  /status  /pubkey                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Control Plane Client                       │ │
│  │  Registration Loop → Peer Sync Loop → Metrics Push     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Network Flow

1. **Client → NLB → VPN Node**: Encrypted VPN traffic (WireGuard/OpenVPN/IKEv2)
2. **VPN Node → Control Plane**: Registration, peer sync (HTTPS)
3. **VPN Node → Metrics Service**: Metrics reporting (HTTPS)

---

## Pre-Deployment Checklist

### Infrastructure Prerequisites

- [ ] Control Plane API deployed and accessible
- [ ] Metrics Service deployed (optional but recommended)
- [ ] ECR repository created with vpn-server image pushed
- [ ] VPC with public subnets configured
- [ ] Security groups allowing VPN protocols

### Configuration Requirements

| Item | Source | Example |
|------|--------|---------|
| VPN Token | Admin Panel | `vpn_abc123...` |
| Control Plane URL | Pulumi Output | `https://api.vpnvpn.com` |
| Metrics URL | Pulumi Output | `https://metrics.vpnvpn.com/metrics/vpn` |
| ECR Image URI | Pulumi Output | `123456789.dkr.ecr.us-east-1.amazonaws.com/vpnvpn/rust-server:latest` |
| Region | AWS Region | `us-east-1` |

### Generate VPN Token

1. Login to web dashboard as admin
2. Navigate to Admin → Token Management
3. Click "Create Token"
4. Enter label (e.g., `us-east-1-prod`)
5. Copy and securely store the generated token

---

## Deployment Methods

### Method 1: Pulumi (Recommended for Production)

#### Initial Setup

```bash
cd infra/pulumi
bun install

# Login to Pulumi
pulumi login

# Select or create regional stack
pulumi stack select region-us-east-1 --create
```

#### Configure Stack

```bash
# Required configuration
pulumi config set region:imageTag sha-abc123  # From ECR push
pulumi config set region:minInstances 2
pulumi config set region:maxInstances 10
pulumi config set region:desiredInstances 3
pulumi config set region:instanceType t3.medium

# Optional configuration
pulumi config set region:adminCidr "10.0.0.0/8"  # Restrict admin API access
pulumi config set region:targetSessionsPerInstance 100
```

#### Deploy

```bash
# Preview changes
pulumi preview

# Deploy
pulumi up -y

# Get outputs
pulumi stack output nlbDnsName
```

### Method 2: Docker (Development/Testing)

```bash
# Build image locally
cd apps/vpn-server
docker build -t vpn-server:local .

# Run with Docker
docker run -d \
  --name vpn-node \
  --cap-add NET_ADMIN \
  -p 51820:51820/udp \
  -p 8080:8080 \
  -e API_URL=https://api.vpnvpn.com \
  -e VPN_TOKEN=your-token-here \
  -e METRICS_URL=https://metrics.vpnvpn.com/metrics/vpn \
  -e SERVER_ID=local-dev-01 \
  -e VPN_REGION=us-east-1 \
  vpn-server:local run
```

### Method 3: Binary (Direct Installation)

```bash
# Build
cd apps/vpn-server
cargo build --release

# Install dependencies (Debian/Ubuntu)
sudo apt-get install -y wireguard-tools openvpn strongswan

# Run
./target/release/vpn-server run \
  --api-url https://api.vpnvpn.com \
  --token your-token-here \
  --listen-port 51820 \
  --admin-port 8080
```

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_URL` | Yes | - | Control Plane API URL |
| `VPN_TOKEN` | Yes | - | Authentication token |
| `LISTEN_UDP_PORT` | No | `51820` | WireGuard listen port |
| `ADMIN_PORT` | No | `8080` | Admin API port |
| `SERVER_ID` | No | `$HOSTNAME` | Unique server identifier |
| `VPN_REGION` | No | - | AWS region for metrics |
| `METRICS_URL` | No | - | Metrics ingestion endpoint |
| `VPN_PROTOCOLS` | No | `wireguard,openvpn,ikev2` | Enabled protocols |
| `RUST_LOG` | No | `info` | Log level |

---

## Health Verification

### Post-Deployment Checks

#### 1. Check Node Registration

```bash
# Via Admin API
curl -s http://NODE_IP:8080/health | jq .

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "vpn-server",
  "checks": {
    "vpnBackends": {
      "status": "ok",
      "active": ["wireguard", "openvpn", "ikev2"]
    },
    "system": {
      "status": "ok"
    }
  }
}
```

#### 2. Verify Control Plane Registration

```bash
# List servers via control plane
curl -s -H "x-api-key: YOUR_API_KEY" \
  https://api.vpnvpn.com/servers | jq '.[] | select(.id == "your-server-id")'
```

#### 3. Check Peer Sync

```bash
# Get current status
curl -s http://NODE_IP:8080/status | jq .

# Check peers applied
# Verify "active_sessions" matches expected peer count
```

#### 4. Verify WireGuard Public Key

```bash
curl -s http://NODE_IP:8080/pubkey | jq .
# Returns the server's WireGuard public key
```

### Automated Health Check Script

```bash
#!/bin/bash
# health-check.sh

NODE_IP=${1:-"localhost"}
ADMIN_PORT=${2:-8080}

echo "Checking VPN node at ${NODE_IP}:${ADMIN_PORT}..."

# Health endpoint
HEALTH=$(curl -sf "http://${NODE_IP}:${ADMIN_PORT}/health" 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "FAIL: Cannot reach health endpoint"
  exit 1
fi

STATUS=$(echo "$HEALTH" | jq -r '.status')
if [ "$STATUS" != "healthy" ]; then
  echo "FAIL: Node unhealthy - $STATUS"
  echo "$HEALTH" | jq .
  exit 1
fi

# Check VPN backends
BACKENDS=$(echo "$HEALTH" | jq -r '.checks.vpnBackends.active[]?' 2>/dev/null | wc -l)
if [ "$BACKENDS" -eq 0 ]; then
  echo "WARN: No VPN backends active"
fi

echo "OK: Node healthy with $BACKENDS active backends"
exit 0
```

---

## Scaling Operations

### Manual Scaling (Pulumi)

```bash
cd infra/pulumi
pulumi stack select region-us-east-1

# Scale up
pulumi config set region:desiredInstances 5
pulumi up -y

# Scale down
pulumi config set region:desiredInstances 2
pulumi up -y
```

### Auto Scaling Configuration

The VPN ASG uses target-tracking autoscaling based on active sessions:

```bash
# Configure target sessions per instance
pulumi config set region:targetSessionsPerInstance 100

# Scaling behavior:
# - Scale out: When avg sessions > 100 per instance
# - Scale in: When avg sessions < 70 per instance (70% of target)
```

### Multi-Region Deployment

```bash
# Deploy to US East
pulumi stack select region-us-east-1
pulumi config set region:desiredInstances 3
pulumi up -y

# Deploy to EU West
pulumi stack select region-eu-west-1 --create
pulumi config set aws:region eu-west-1
pulumi config set region:imageTag sha-abc123
pulumi config set region:minInstances 1
pulumi config set region:maxInstances 5
pulumi config set region:desiredInstances 2
pulumi up -y

# Deploy to AP Southeast
pulumi stack select region-ap-southeast-1 --create
pulumi config set aws:region ap-southeast-1
pulumi config set region:imageTag sha-abc123
pulumi config set region:minInstances 1
pulumi config set region:maxInstances 5
pulumi config set region:desiredInstances 1
pulumi up -y
```

---

## Monitoring

### Prometheus Metrics

The admin API exposes Prometheus metrics at `/metrics`:

```bash
curl http://NODE_IP:8080/metrics
```

**Available Metrics:**

| Metric | Type | Description |
|--------|------|-------------|
| `vpn_active_sessions_total` | Gauge | Total active VPN sessions |
| `vpn_active_sessions_by_protocol` | Gauge | Sessions by protocol |
| `vpn_egress_bytes_total` | Counter | Total bytes sent |
| `vpn_ingress_bytes_total` | Counter | Total bytes received |

### CloudWatch Metrics

When deployed via Pulumi, the following CloudWatch metrics are available:

- `CPUUtilization` - Instance CPU usage
- `NetworkIn/NetworkOut` - Network traffic
- Custom metrics via CloudWatch Agent (if configured)

### Grafana Dashboards

Import the following dashboards in Grafana:

1. **VPN Node Overview**: Session counts, bandwidth, CPU/memory
2. **Regional Distribution**: Sessions by region
3. **Error Rates**: Connection failures, sync errors

### Log Analysis

```bash
# CloudWatch Logs Insights query for errors
fields @timestamp, @message
| filter @message like /error/i
| sort @timestamp desc
| limit 100

# Query for registration events
fields @timestamp, @message
| filter @message like /register/i
| sort @timestamp desc
| limit 50
```

---

## Maintenance Procedures

### Rolling Update

```bash
# 1. Build and push new image
cd apps/vpn-server
docker build -t $ECR_URI:new-version .
docker push $ECR_URI:new-version

# 2. Update stack configuration
cd infra/pulumi
pulumi stack select region-us-east-1
pulumi config set region:imageTag new-version

# 3. Deploy (rolling update)
pulumi up -y
```

### Drain Node for Maintenance

```bash
# 1. Set ASG instance to standby (prevents new connections)
aws autoscaling enter-standby \
  --instance-ids i-1234567890abcdef0 \
  --auto-scaling-group-name vpnvpn-asg \
  --should-decrement-desired-capacity

# 2. Wait for existing connections to drain (monitor sessions)
while true; do
  SESSIONS=$(curl -s http://NODE_IP:8080/status | jq '.[0].active_sessions')
  echo "Active sessions: $SESSIONS"
  [ "$SESSIONS" -eq 0 ] && break
  sleep 30
done

# 3. Perform maintenance...

# 4. Return to service
aws autoscaling exit-standby \
  --instance-ids i-1234567890abcdef0 \
  --auto-scaling-group-name vpnvpn-asg
```

### Token Rotation

```bash
# 1. Create new token in admin panel
# 2. Update Pulumi secrets
pulumi config set --secret vpnToken "new-token-value"

# 3. Rolling restart (deploy with same config triggers restart)
pulumi up -y

# 4. Verify nodes register with new token
# 5. Revoke old token in admin panel
```

---

## Troubleshooting

### Common Issues

#### Node Won't Start

**Symptom:** Container exits immediately

```bash
docker logs vpn-node
```

**Possible Causes:**

1. **Missing dependencies**
   ```bash
   # Run doctor command
   ./vpn-server doctor
   ```

2. **Invalid token**
   - Check token is active in admin panel
   - Verify `VPN_TOKEN` environment variable

3. **Control plane unreachable**
   - Check `API_URL` is correct
   - Verify network connectivity
   - Check security groups allow outbound HTTPS

#### Registration Failed

**Symptom:** `registration_failed_retrying` in logs

**Resolution:**

```bash
# Check control plane is accessible
curl -v https://api.vpnvpn.com/health

# Verify token
curl -X POST https://api.vpnvpn.com/server/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"test","publicKey":"test","listenPort":51820}'
```

#### Peers Not Syncing

**Symptom:** `peer_sync_request_failed` in logs

**Resolution:**

```bash
# Manual peer fetch test
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://api.vpnvpn.com/server/peers?id=YOUR_SERVER_ID"

# Check WireGuard interface
wg show
```

#### High Memory Usage

**Symptom:** Node marked unhealthy due to memory > 95%

**Resolution:**

1. Check for memory leaks in logs
2. Increase instance size
3. Reduce peer count per node (scale horizontally)

#### WireGuard Handshake Fails

**Symptom:** Clients can't connect

**Resolution:**

```bash
# Check WireGuard interface
wg show

# Verify peer is configured
wg show wg0 peers

# Check firewall rules
iptables -L -n

# Verify UDP port is open
nc -zuv NODE_IP 51820
```

### Debug Mode

Enable verbose logging:

```bash
# Docker
docker run ... -e RUST_LOG=debug vpn-server:local run

# Binary
RUST_LOG=debug ./vpn-server run ...
```

### Support Escalation

If issues persist:

1. Collect logs: `docker logs vpn-node > vpn-node.log 2>&1`
2. Capture health status: `curl http://NODE_IP:8080/health > health.json`
3. Note environment details: region, instance type, peer count
4. Check CloudWatch for correlated errors
5. Review recent changes (deployments, config updates)

---

## Quick Reference

### CLI Commands

```bash
# Doctor check
./vpn-server doctor

# Run server
./vpn-server run --api-url URL --token TOKEN

# View help
./vpn-server --help
./vpn-server run --help
```

### Admin API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with component status |
| `/metrics` | GET | Prometheus metrics |
| `/status` | GET | VPN backend status |
| `/pubkey` | GET | WireGuard public key |

### Useful AWS Commands

```bash
# List instances in ASG
aws autoscaling describe-auto-scaling-instances \
  --query "AutoScalingInstances[?AutoScalingGroupName=='vpnvpn-asg']"

# View recent scaling activities
aws autoscaling describe-scaling-activities \
  --auto-scaling-group-name vpnvpn-asg \
  --max-items 10

# Get NLB DNS name
aws elbv2 describe-load-balancers \
  --query "LoadBalancers[?contains(LoadBalancerName,'vpnvpn')].DNSName"
```




