#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Ensure we are in the local directory
cd "$(dirname "$0")"

# Parse mode flag
MODE="docker"
if [[ "$1" == "--local" || "$1" == "-l" ]]; then
    MODE="local"
    shift
fi

if [[ "$MODE" == "local" ]]; then
    log "Running in LOCAL mode (native VPN server)..."
    
    # Start only the mock API
    log "Starting mock control plane API..."
    if ! pgrep -f "node.*mock-api/index.js" > /dev/null; then
        cd mock-api
        npm install --silent 2>&1 > /dev/null || warn "npm install had warnings"
        PORT=8080 node index.js &
        MOCK_API_PID=$!
        cd ..
        echo $MOCK_API_PID > .mock-api.pid
        log "Mock API started (PID: $MOCK_API_PID)"
    else
        warn "Mock API already running"
    fi
    
    log "Waiting for API to be ready..."
    sleep 3
    
    # Build VPN server if needed
    log "Building VPN server..."
    cd ../vpn-server
    cargo build --release 2>&1 | grep -E "(Compiling|Finished)" || true
    
    # Run VPN server
    log "Starting VPN server locally..."
    export API_URL=http://localhost:8080
    export VPN_TOKEN=dev-token
    export LISTEN_UDP_PORT=51820
    export ADMIN_PORT=9090
    export RUST_LOG=info
    export VPN_PROTOCOLS=wireguard
    export DISABLE_CLOUDWATCH_METRICS=1
    
    # Check doctor first
    log "Running doctor check..."
    sudo ./target/release/vpn-server doctor || error "Doctor check failed"
    
    log "Starting VPN server (requires sudo for network operations)..."
    sudo -E ./target/release/vpn-server run \
        --api-url "$API_URL" \
        --token "$VPN_TOKEN" \
        --listen-port "$LISTEN_UDP_PORT" \
        --admin-port "$ADMIN_PORT" &
    VPN_PID=$!
    cd ../local
    echo $VPN_PID > .vpn-server.pid
    
    log "Waiting for VPN server to start..."
    sleep 5
    
else
    log "Running in DOCKER mode..."
    log "Starting Docker Compose stack..."
    docker compose up -d --build

    log "Waiting for services to stabilize..."
    sleep 20

    log "Checking vpn-node doctor..."
    docker compose exec vpn-node vpn-server doctor || error "Doctor failed"
fi

log "Checking if VPN Node registered with control plane..."
SERVERS=$(curl -s http://localhost:8080/test/servers || true)
if [[ "$SERVERS" == *"51820"* ]]; then
  log "VPN Node registration confirmed!"
else
  error "VPN Node did not register. Response: $SERVERS"
fi

log "Running comprehensive End-to-End tests..."
if command -v node >/dev/null 2>&1; then
    node e2e-test.js || error "End-to-End tests failed"
else
    warn "Node.js not found, skipping advanced E2E tests"
fi

log "Fetching VPN connection info..."
curl -s http://localhost:8080/test/info | jq '.' || warn "Could not fetch info (jq not installed?)"

info ""
info "╔══════════════════════════════════════════════════════════╗"
info "║        Test Flow Completed Successfully!                 ║"
info "╚══════════════════════════════════════════════════════════╝"
info ""
info "📊 Dashboard:        http://localhost:8080/dashboard"
info "🔍 VPN Status:       http://localhost:9090/status"
info "ℹ️  API Info:         http://localhost:8080/test/info"
info "🖥️  Servers:          http://localhost:8080/test/servers"
info ""

if [[ "$MODE" == "local" ]]; then
    info "To stop local services:"
    info "  ./stop-local.sh"
    info ""
    info "Or manually:"
    info "  kill \$(cat .mock-api.pid .vpn-server.pid 2>/dev/null)"
else
    info "To stop Docker services:"
    info "  docker compose down"
fi

info ""
info "📖 View the dashboard for complete system status and credentials"
info ""

