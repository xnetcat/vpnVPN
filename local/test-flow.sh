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
sleep 10

# Check if VPN Node registered
log "Checking if VPN Node registered with Mock API..."
REGISTRATION=$(curl -s http://localhost:8080/test/servers)
if [[ $REGISTRATION == *"51820"* ]]; then
    log "VPN Node registration confirmed: $REGISTRATION"
else
    error "VPN Node did not register. Response: $REGISTRATION"
fi

# Add a test peer
TEST_PEER='{
    "public_key": "yDLkUj/uQ9V+UaM/8JzT7qL1iJ8qK9xH3n5wPz4v/1w=",
    "allowed_ips": ["10.8.0.2/32"],
    "endpoint": "203.0.113.1:51820"
}'

log "Injecting test peer via Mock API..."
curl -s -X POST -H "Content-Type: application/json" -d "$TEST_PEER" http://localhost:8080/test/add-peer

log "Waiting for Sync Loop (approx 15s)..."
sleep 15

# Check logs for application of peer
log "Checking VPN Node logs for peer application..."
# Retry log check
for i in {1..5}; do
    if docker compose logs vpn-node | grep -q "applying_peers"; then
        log "Success! VPN Node received peer update."
        break
    fi
    if [ $i -eq 5 ]; then
        error "VPN Node logs do not show peer application after multiple attempts."
    fi
    sleep 2
done

# Check if WireGuard config was written (exec into container)
log "Verifying WireGuard config inside container..."
if docker compose exec vpn-node grep -q "yDLkUj/uQ9V+UaM/8JzT7qL1iJ8qK9xH3n5wPz4v/1w=" /etc/wireguard/wg0.conf; then
    log "Success! Peer found in wg0.conf."
else
    error "Peer not found in wg0.conf."
fi

log "Test Flow Completed Successfully."

