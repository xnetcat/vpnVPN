#!/usr/bin/env bash
# =============================================================================
# VPN Node Setup Script (Template)
# =============================================================================
# This script sets up a VPN node on a fresh Linux server.
# It installs Docker, configures NAT, sets up Grafana Alloy for metrics,
# and starts the VPN server container.
#
# Usage: sudo bash setup-vpn-node.sh
#
# Required environment variables:
#   CONTROL_PLANE_URL   - Control plane API URL (e.g., https://api.vpnvpn.dev)
#   VPN_TOKEN           - VPN node registration token
#   GRAFANA_REMOTE_URL  - Grafana Cloud Prometheus remote write URL
#   GRAFANA_USER        - Grafana Cloud metrics user/instance ID
#   GRAFANA_API_KEY     - Grafana Cloud API key
#
# Optional:
#   VPN_IMAGE           - Docker image (default: ghcr.io/xnetcat/vpnvpn/vpn-server:latest)
#   SERVER_ID           - Custom server ID (default: hostname)
# =============================================================================

set -euo pipefail

: "${CONTROL_PLANE_URL:?CONTROL_PLANE_URL is required}"
: "${VPN_TOKEN:?VPN_TOKEN is required}"
VPN_IMAGE="${VPN_IMAGE:-ghcr.io/xnetcat/vpnvpn/vpn-server:latest}"
SERVER_ID="${SERVER_ID:-$(hostname)}"

echo "=== vpnVPN Node Setup ==="
echo "Control Plane: $CONTROL_PLANE_URL"
echo "Server ID: $SERVER_ID"
echo "Image: $VPN_IMAGE"

# --- Install Docker ---
if ! command -v docker &>/dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
else
    echo "Docker already installed"
fi

# --- Enable IP Forwarding ---
echo "Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

# --- Configure NAT ---
echo "Setting up NAT masquerading..."
DEFAULT_IFACE=$(ip route show default | awk '/default/ {print $5}' | head -1)
if [ -z "$DEFAULT_IFACE" ]; then
    DEFAULT_IFACE="eth0"
fi

iptables -t nat -C POSTROUTING -o "$DEFAULT_IFACE" -j MASQUERADE 2>/dev/null || \
    iptables -t nat -A POSTROUTING -o "$DEFAULT_IFACE" -j MASQUERADE

# Make iptables rules persistent
if command -v netfilter-persistent &>/dev/null; then
    netfilter-persistent save
elif command -v iptables-save &>/dev/null; then
    iptables-save > /etc/iptables.rules
fi

# --- Install Grafana Alloy (optional) ---
if [ -n "${GRAFANA_REMOTE_URL:-}" ] && [ -n "${GRAFANA_USER:-}" ] && [ -n "${GRAFANA_API_KEY:-}" ]; then
    echo "Setting up Grafana Alloy for metrics..."

    # Install Alloy
    if ! command -v alloy &>/dev/null; then
        curl -fsSL https://apt.grafana.com/gpg.key | gpg --dearmor -o /etc/apt/keyrings/grafana.gpg
        echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" > /etc/apt/sources.list.d/grafana.list
        apt-get update && apt-get install -y alloy
    fi

    # Configure Alloy to scrape VPN server metrics
    mkdir -p /etc/alloy
    cat > /etc/alloy/config.alloy <<ALLOY_EOF
prometheus.scrape "vpn_server" {
    targets = [{"__address__" = "localhost:8080"}]
    forward_to = [prometheus.remote_write.grafana_cloud.receiver]
    scrape_interval = "15s"
}

prometheus.remote_write "grafana_cloud" {
    endpoint {
        url = "${GRAFANA_REMOTE_URL}"
        basic_auth {
            username = "${GRAFANA_USER}"
            password = "${GRAFANA_API_KEY}"
        }
    }
}
ALLOY_EOF

    systemctl enable --now alloy
    echo "Grafana Alloy configured and started"
else
    echo "Skipping Grafana Alloy setup (GRAFANA_* vars not set)"
fi

# --- Pull and Run VPN Server ---
echo "Pulling VPN server image..."
docker pull "$VPN_IMAGE"

echo "Starting VPN server container..."
docker rm -f vpn-server 2>/dev/null || true
docker run -d \
    --name vpn-server \
    --restart unless-stopped \
    --network host \
    --cap-add NET_ADMIN \
    --device /dev/net/tun:/dev/net/tun \
    -e API_URL="$CONTROL_PLANE_URL" \
    -e VPN_TOKEN="$VPN_TOKEN" \
    -e SERVER_ID="$SERVER_ID" \
    -e METRICS_URL="${CONTROL_PLANE_URL}/metrics/vpn" \
    -e LISTEN_UDP_PORT=51820 \
    -e ADMIN_PORT=8080 \
    -e RUST_LOG=info \
    -e VPN_PROTOCOLS=wireguard,openvpn,ikev2 \
    "$VPN_IMAGE"

echo ""
echo "=== Setup Complete ==="
echo "VPN server is running. Check status with:"
echo "  docker logs vpn-server"
echo "  curl http://localhost:8080/health"
echo "  curl http://localhost:8080/metrics"
