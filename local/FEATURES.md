# Local Development Features

This document describes the enhanced local development features for vpnVPN.

## 🎯 Overview

The local testing environment now supports two modes:
1. **Docker Mode** - Full containerized stack (original)
2. **Local Mode** - Native VPN server execution (new)

## 🆕 New Features

### 1. Local Mode Testing

Run the VPN server natively on your machine for faster iteration and easier debugging.

**Usage:**
```bash
./test-flow.sh --local
```

**Benefits:**
- Faster startup (no Docker build)
- Direct access to logs
- Easier debugging with native tools
- Lower resource usage
- Faster iteration cycle

**Requirements:**
- Rust toolchain
- WireGuard tools (`brew install wireguard-tools`)
- Sudo access

### 2. Enhanced Mock API

The mock control plane API now includes comprehensive status and info endpoints.

#### New Endpoints

##### `GET /test/info`
Complete system status including:
- Control plane status and URL
- Registered VPN servers
- Configured peers
- Connection credentials (token, API key)
- Admin endpoints
- Quick start commands

**Example:**
```bash
curl http://localhost:8080/test/info | jq
```

##### `GET /test/status`
Quick status check:
```bash
curl http://localhost:8080/test/status | jq
```

Returns:
```json
{
  "status": "ok",
  "timestamp": "2025-11-21T...",
  "servers_registered": 1,
  "servers_online": 1,
  "peers_configured": 0,
  "uptime_seconds": 45
}
```

##### `GET /dashboard`
Web-based dashboard with:
- Real-time system status
- Server list with online/offline status
- Configured peers
- Connection information
- API endpoints
- Quick start commands
- Auto-refresh every 10 seconds

**Open in browser:**
```bash
open http://localhost:8080/dashboard
```

##### `GET /`
API information and available endpoints

### 3. Helper Scripts

#### `run-vpn-local.sh`
Standalone script to run VPN server locally:
```bash
./run-vpn-local.sh
```

Features:
- Checks if mock API is running
- Builds VPN server if needed
- Runs doctor check
- Starts VPN server with proper configuration
- Shows all configuration details

#### `stop-local.sh`
Stops all local services:
```bash
./stop-local.sh
```

Cleans up:
- Mock API process
- VPN server process
- PID files

#### `example-usage.sh`
Demonstrates API usage:
```bash
./example-usage.sh
```

Shows:
- Starting mock API
- Checking status
- Adding peers
- Viewing system info
- Opening dashboard

### 4. Enhanced Logging

The mock API now displays a beautiful startup banner:
```
╔════════════════════════════════════════════════════════════╗
║          vpnVPN Mock Control Plane API                     ║
╚════════════════════════════════════════════════════════════╝

✅ Server running on port 8080

📊 Dashboard:       http://localhost:8080/dashboard
ℹ️  System Info:     http://localhost:8080/test/info
🔍 Status:          http://localhost:8080/test/status
```

## 🚀 Quick Start Guide

### Option 1: Full Docker Stack
```bash
cd local
./test-flow.sh
```

### Option 2: Local Development (Faster)
```bash
cd local
./test-flow.sh --local
```

### Option 3: Manual Control
```bash
# Terminal 1: Start Mock API
cd local/mock-api
npm start

# Terminal 2: Run VPN Server
cd local
./run-vpn-local.sh

# Terminal 3: View Dashboard
open http://localhost:8080/dashboard
```

## 📊 Monitoring & Debugging

### View Dashboard
Open in browser: http://localhost:8080/dashboard

### Check VPN Server Status
```bash
curl http://localhost:9090/status | jq
```

### Check Mock API Status
```bash
curl http://localhost:8080/test/status | jq
```

### View Complete System Info
```bash
curl http://localhost:8080/test/info | jq
```

### View Prometheus Metrics
```bash
curl http://localhost:9090/metrics
```

### View Registered Servers
```bash
curl http://localhost:8080/test/servers | jq
```

## 🔧 Configuration

### Environment Variables

For Mock API:
```bash
PORT=8080              # API port
DEV_TOKEN=dev-token    # VPN server token
API_KEY=dev-web-api-key # Web app API key
```

For VPN Server:
```bash
API_URL=http://localhost:8080    # Control plane URL
VPN_TOKEN=dev-token               # Authentication token
LISTEN_UDP_PORT=51820             # VPN listen port
ADMIN_PORT=9090                   # Admin API port
RUST_LOG=info                     # Log level
VPN_PROTOCOLS=wireguard           # Enabled protocols
DISABLE_CLOUDWATCH_METRICS=1      # Disable CloudWatch
```

## 🧪 Testing Workflows

### Add a Test Peer
```bash
curl -X POST http://localhost:8080/test/add-peer \
  -H 'Content-Type: application/json' \
  -d '{
    "public_key": "YOUR_CLIENT_PUBLIC_KEY",
    "allowed_ips": ["10.8.0.2/32"]
  }'
```

### Verify Peer Configuration
```bash
curl http://localhost:8080/server/peers | jq
```

### Check VPN Server Health
```bash
curl http://localhost:9090/health
```

### View Active Sessions
```bash
curl http://localhost:9090/status | jq '.[] | {protocol, active_sessions}'
```

## 📝 Tips

1. **Use Local Mode for Development**: Faster iteration, easier debugging
2. **Use Docker Mode for Integration Testing**: Full stack testing
3. **Keep Dashboard Open**: Real-time monitoring during development
4. **Check Logs**: VPN server logs show registration and peer sync
5. **Use jq**: Pretty print JSON responses for better readability

## 🐛 Troubleshooting

### VPN Server Won't Start
```bash
# Check dependencies
cd vpn-server
cargo run -- doctor

# Check if WireGuard is installed
which wg

# On macOS
brew install wireguard-tools
```

### Mock API Not Responding
```bash
# Check if port is in use
lsof -i :8080

# Restart the API
./stop-local.sh
cd mock-api && npm start
```

### Permission Denied
```bash
# VPN server needs sudo for network operations
sudo ./run-vpn-local.sh
```

### Docker Image Corruption
```bash
# Clean Docker
docker system prune -a

# Rebuild
docker compose build --no-cache
```

## 📚 Related Files

- `test-flow.sh` - Main test script with local/docker modes
- `run-vpn-local.sh` - Standalone VPN server runner
- `stop-local.sh` - Stop local services
- `example-usage.sh` - Usage examples
- `mock-api/index.js` - Enhanced mock API
- `mock-api/dashboard.html` - Web dashboard
- `README.md` - Main documentation

## 🎨 Dashboard Features

The web dashboard provides:
- **System Status**: Environment, timestamp, control plane status
- **VPN Servers**: Registration status, online/offline
- **Configured Peers**: List of allowed peers
- **Connection Info**: URLs, tokens, API keys
- **Registered Servers**: Details of each VPN server
- **API Endpoints**: All available endpoints
- **Quick Start**: Copy-paste commands
- **Auto-refresh**: Updates every 10 seconds

Access at: http://localhost:8080/dashboard

