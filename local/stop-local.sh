#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[STOP]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Ensure we are in the local directory
cd "$(dirname "$0")"

log "Stopping local VPN services..."

# Stop mock API
if [ -f .mock-api.pid ]; then
    PID=$(cat .mock-api.pid)
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        log "Stopped mock API (PID: $PID)"
    fi
    rm .mock-api.pid
fi

# Stop VPN server
if [ -f .vpn-server.pid ]; then
    PID=$(cat .vpn-server.pid)
    if kill -0 "$PID" 2>/dev/null; then
        sudo kill "$PID"
        log "Stopped VPN server (PID: $PID)"
    fi
    rm .vpn-server.pid
fi

# Kill any remaining processes
pkill -f "node.*mock-api/index.js" 2>/dev/null && log "Cleaned up remaining mock API processes"
sudo pkill -f "vpn-server run" 2>/dev/null && log "Cleaned up remaining VPN server processes"

log "Local services stopped"

