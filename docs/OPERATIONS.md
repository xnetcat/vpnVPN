# Operations & Runbook

This guide covers the operational aspects of vpnVPN, including VPN node management, maintenance procedures, and troubleshooting.

## 1. VPN Node Management

### Architecture

VPN Nodes run on EC2 instances managed by an Auto Scaling Group (ASG). They register with the **Control Plane** via an Admin API (`:8080`) and report metrics to the **Metrics Service**.

### Scaling

Scaling is managed by Pulumi configuration for the regional stack.

```bash
# Scale Up/Down
pulumi stack select region-us-east-1-production
pulumi config set region:desiredInstances 5
pulumi up -y
```

**Auto-Scaling:** Configured to track average active sessions per instance (Target Tracking).

### Monitoring

- **Health Check:** `http://<NODE_IP>:8080/health`
- **Metrics:** `http://<NODE_IP>:8080/metrics` (Prometheus format)
- **Logs:** CloudWatch Logs (`/vpnvpn/vpn-server`)

---

## 2. Maintenance Procedures

### Backup & Recovery

| Component        | Method                  | Frequency  | Retention |
| :--------------- | :---------------------- | :--------- | :-------- |
| **Database**     | Neon Auto-Backup (PITR) | Continuous | 30 Days   |
| **Pulumi State** | Pulumi Cloud            | Continuous | Unlimited |
| **Secrets**      | AWS Secrets Manager     | N/A        | N/A       |

**Database Restore:** Use Neon Console to create a branch from a point-in-time or restore from a scheduled dump.

### Certificate Rotation

- **ACM Certificates:** Automatically managed and renewed by AWS/Pulumi.
- **VPN Server Keys:** Persisted on nodes. To rotate, update `NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY` and trigger a rolling replacement of nodes.
- **VPN Tokens:**
  1.  Generate new token via Admin API.
  2.  Update Pulumi secret: `pulumi config set --secret vpnToken "NEW_TOKEN"`.
  3.  Redeploy regional stacks to roll instances.

### Updates

- **VPN Server:** Push new image tag -> Update Pulumi `imageTag` -> `pulumi up` (triggers rolling update).
- **Lambda:** `pulumi up` updates function code automatically.

---

## 3. Troubleshooting

### Common Issues

#### Node Won't Register

- **Symptom:** Logs show `registration_failed`.
- **Check:**
  - Is `VPN_TOKEN` correct?
  - Is `API_URL` reachable from the node? (Check Security Groups/NACLs).
  - Is the Control Plane healthy? (`curl https://api.vpnvpn.dev/health`)

#### Clients Can't Connect

- **Symptom:** Handshake fails.
- **Check:**
  - Security Group allowing UDP 51820?
  - Client config matches Server Public Key?
  - Node healthy?

#### Database Connection Errors

- **Symptom:** Lambda timeouts / 500 errors.
- **Check:**
  - Neon status.
  - Connection pool exhaustion (check Neon dashboard).

### Diagnostic Commands

```bash
# Check Node Health
curl http://<NODE_IP>:8080/health

# Check Control Plane Health
curl https://api.vpnvpn.dev/health

# Check Logs (AWS CLI)
aws logs tail /aws/lambda/control-plane --follow
```

### Escalation

1.  Check CloudWatch Dashboards.
2.  Review recent deployments/changes.
3.  Check Database status.
4.  Contact Platform Lead.
