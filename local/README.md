Local stack & end-to-end testing

This folder contains tooling to run a local, fully wired version of vpnVPN:

- `web-app` in dev mode.
- `vpn-server` as a Docker container OR natively on your host.
- Postgres for Prisma.
- LocalStack for the AWS control plane (DynamoDB, Lambda, API Gateway).
- Mock Control Plane API for lightweight testing.

There are **no mock APIs** in the main local flow; all components communicate over the same HTTP interfaces used in production.

## Quick Start

### Option 1: Docker Mode (Full Stack)

Run everything in Docker containers:

```bash
./test-flow.sh
```

This starts:

- LocalStack (AWS services)
- VPN server (Docker)
- Web app (Docker)
- Postgres (Docker)
- Mock API (Docker)

### Option 2: Local Mode (Native VPN)

Run VPN server natively on your host (faster iteration, easier debugging):

```bash
./test-flow.sh --local
```

This starts:

- Mock Control Plane API (Node.js)
- VPN server (native binary, requires sudo)

**Prerequisites for local mode:**

- Rust toolchain installed
- WireGuard installed (`brew install wireguard-tools` on macOS)
- Sudo access for network operations

### Manual Control

Run components individually:

```bash
# Start just the VPN server locally
./run-vpn-local.sh

# Stop local services
./stop-local.sh

# Start Docker stack
docker compose up -d

# Stop Docker stack
docker compose down
```

## System Status & Connection Info

After starting services, view complete system status:

```bash
# View full system info (servers, peers, credentials, endpoints)
curl http://localhost:8080/test/info | jq

# View quick status
curl http://localhost:8080/test/status | jq

# View VPN server status
curl http://localhost:9090/status | jq

# View registered servers
curl http://localhost:8080/test/servers | jq
```

## Adding Test Peers

```bash
# Add a test peer to connect to the VPN
curl -X POST http://localhost:8080/test/add-peer \
  -H 'Content-Type: application/json' \
  -d '{
    "public_key": "YOUR_CLIENT_PUBLIC_KEY",
    "allowed_ips": ["10.8.0.2/32"]
  }'

# Verify peers are configured
curl http://localhost:8080/server/peers | jq
```

## Useful Endpoints

- **Mock API Info**: http://localhost:8080/test/info
- **Mock API Status**: http://localhost:8080/test/status
- **VPN Health Check**: http://localhost:9090/health
- **VPN Status**: http://localhost:9090/status
- **VPN Metrics**: http://localhost:9090/metrics

## Notes

- EC2/NLB are not emulated in LocalStack community; data-plane autoscaling should be tested against real AWS.
- Control-plane subsystems (DynamoDB/Lambda/API GW) are fully testable via LocalStack.
- Local mode is recommended for rapid VPN server development.
- Docker mode is recommended for full-stack integration testing.

## Environment Variables

For local VPN server customization:

```bash
export API_URL=http://localhost:8080
export VPN_TOKEN=dev-token
export LISTEN_UDP_PORT=51820
export ADMIN_PORT=9090
export VPN_PROTOCOLS=wireguard
export RUST_LOG=debug
```
