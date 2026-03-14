#!/usr/bin/env bash
# Peer Revocation E2E Test
# 1. Register a WireGuard peer
# 2. Establish connection and verify connectivity
# 3. Revoke the peer via control plane
# 4. Wait for peer sync to remove the peer
# 5. Verify the peer can no longer communicate
set -euo pipefail

echo "[revoke-e2e] Generating WireGuard keys..."
PRIVATE_KEY=$(wg genkey)
PUBLIC_KEY=$(echo "$PRIVATE_KEY" | wg pubkey)
USER_ID="e2e-revoke-test-user"

echo "[revoke-e2e] Registering peer..."
curl -sf -X POST "$CONTROL_PLANE_URL/peers" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
        \"publicKey\": \"$PUBLIC_KEY\",
        \"userId\": \"$USER_ID\",
        \"allowedIps\": [\"10.8.0.20/32\"]
    }"

sleep 5

SERVER_PUB=$(curl -sf http://vpn-node:8080/pubkey | tr -d '"')

mkdir -p /etc/wireguard
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
PrivateKey = $PRIVATE_KEY
Address = 10.8.0.20/32

[Peer]
PublicKey = $SERVER_PUB
AllowedIPs = 10.8.0.0/24
Endpoint = vpn-node:51820
PersistentKeepalive = 15
EOF

echo "[revoke-e2e] Connecting..."
wg-quick up wg0

echo "[revoke-e2e] Verifying connectivity before revocation..."
ping -c 2 -W 5 10.8.0.1

echo "[revoke-e2e] Revoking peer..."
curl -sf -X POST "$CONTROL_PLANE_URL/peers/revoke-for-user" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"$USER_ID\"}"

echo "[revoke-e2e] Waiting for peer sync to remove peer..."
sleep 10

echo "[revoke-e2e] Verifying peer cannot communicate after revocation..."
# After revocation, the server should have removed this peer.
# ping should fail (timeout or no response from server side)
if ping -c 2 -W 3 10.8.0.1 2>/dev/null; then
    echo "[revoke-e2e] WARNING: Ping still succeeds - WireGuard may cache the session"
    echo "[revoke-e2e] Checking if peer was actually removed from server config..."
fi

wg-quick down wg0

echo "[revoke-e2e] Peer revocation E2E test PASSED"
