#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Ensure we are in the local directory
cd "$(dirname "$0")"

log "Starting Docker Compose stack..."
docker compose up -d --build

log "Waiting for services to stabilize..."
sleep 20

log "Checking vpn-node doctor..."
docker compose exec vpn-node vpn-server doctor || error "Doctor failed"

log "Checking if VPN Node registered with control plane..."
SERVERS=$(curl -s http://localhost:8080/servers || true)
if [[ "$SERVERS" == *"online"* ]]; then
  log "VPN Node registration confirmed: $SERVERS"
else
  error "VPN Node did not register. Response: $SERVERS"
fi

log "Triggering web-app device creation flow is manual in this script."
log "Test Flow Completed (control-plane + node basic connectivity)."

