#!/bin/bash
set -e

# Colors for output
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
  echo -e "${BLUE}[dev:web]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[dev:web]${NC} $1"
}

# Cleanup function
cleanup() {
  log "Shutting down services..."
  cd local && docker compose down
  log_success "Services stopped."
  exit 0
}

# Set trap for cleanup on exit
trap cleanup EXIT INT TERM

# Change to project root
cd "$(dirname "$0")/.."

# Step 1: Build all Docker images
log "Building Docker images..."
cd local && docker compose build web-app control-plane metrics vpn-node
cd ..

# Step 2: Start services
log "Starting services..."
cd local && docker compose up -d postgres control-plane metrics web-app vpn-node
cd ..

# Step 3: Wait for API to be healthy
log "Waiting for API to be ready..."
until curl -sf http://localhost:3000/api/health >/dev/null 2>&1; do
  sleep 2
done
log_success "API is ready!"

# Step 4: Start dev processes (no desktop)
log "Starting web development environment..."
exec npx concurrently \
  --kill-others \
  --names "watch,stripe,studio" \
  --prefix-colors "blue,cyan,yellow" \
  "cd local && docker compose watch" \
  "bun run dev:stripe" \
  "bun run dev:studio"

