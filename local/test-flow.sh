#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DIR="$ROOT_DIR/local"

log() { echo -e "${GREEN}[TEST]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

cd "$LOCAL_DIR"

log "=== vpnVPN dockerized local stack ==="

# Ensure wg is available for key generation
if ! command -v wg >/dev/null 2>&1; then
  error "'wg' (wireguard-tools) must be installed to run this script."
fi

# Generate ephemeral WireGuard keys for the docker test client if not provided
if [ -z "$VPN_TEST_CLIENT_PRIVATE_KEY" ] || [ -z "$VPN_TEST_CLIENT_PUBLIC_KEY" ]; then
  log "Generating ephemeral WireGuard keys for vpn-test-client..."
  VPN_TEST_CLIENT_PRIVATE_KEY="$(wg genkey)"
  VPN_TEST_CLIENT_PUBLIC_KEY="$(printf "%s" "$VPN_TEST_CLIENT_PRIVATE_KEY" | wg pubkey)"
  export VPN_TEST_CLIENT_PRIVATE_KEY
  export VPN_TEST_CLIENT_PUBLIC_KEY
else
  log "Using VPN_TEST_CLIENT_* keys from environment."
fi

log "Building Docker images for postgres, web-app, and vpn-node (streaming build logs)..."
docker compose build postgres web-app vpn-node

log "Bringing up core stack (postgres, web-app, vpn-node) in Docker..."
docker compose up -d postgres web-app vpn-node

log "Waiting for vpn-node admin endpoint on http://localhost:9090/health..."
until curl -sf http://localhost:9090/health >/dev/null 2>&1; do
  sleep 1
done
log "vpn-node is healthy."

log "Running dockerized VPN test client (vpn-test-client)..."
if ! docker compose run --rm vpn-test-client; then
  error "Docker VPN connectivity test failed (vpn-test-client)."
fi

log "Docker VPN connectivity test passed (vpn-test-client)."
log "Stack is still running for manual testing."
log ""
log "Web App:   http://localhost:3000"
log "VPN Admin: http://localhost:9090/status"
log ""
log "To stop everything, run:"
echo "  cd \"$LOCAL_DIR\" && docker compose down -v"
