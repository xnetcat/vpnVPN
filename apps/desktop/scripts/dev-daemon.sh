#!/bin/bash
# Quick launcher for daemon development with hot reload
#
# Usage:
#   ./scripts/dev-daemon.sh              # Start daemon with hot reload
#   sudo ./scripts/dev-daemon.sh         # Start with root (for VPN ops)
#   ./scripts/dev-daemon.sh --debug      # Debug logging
#
# In another terminal, run the Tauri app:
#   bun run dev
#
# The app will automatically connect to the dev daemon at /tmp/vpnvpn-daemon.sock

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/../daemon/scripts/dev.sh"

chmod +x "$DAEMON_SCRIPT"
exec "$DAEMON_SCRIPT" "$@"

