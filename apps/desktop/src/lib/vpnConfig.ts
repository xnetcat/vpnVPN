import {
  WG_ENDPOINT,
  WG_SERVER_PUBLIC_KEY,
  OVPN_REMOTE,
  OVPN_PORT,
  IKEV2_REMOTE,
} from "./config";

export function buildWireGuardConfig(params: {
  privateKey: string;
  assignedIp: string;
  serverPublicKeyOverride?: string;
  endpointOverride?: string;
  portOverride?: number;
}) {
  // Use override endpoint if provided, otherwise fall back to env config
  // If endpointOverride is empty string, treat as undefined to use fallback
  const endpoint =
    params.endpointOverride && params.endpointOverride.trim()
      ? `${params.endpointOverride.trim()}:${params.portOverride ?? 51820}`
      : WG_ENDPOINT;
  const serverPublicKey =
    params.serverPublicKeyOverride || WG_SERVER_PUBLIC_KEY;

  console.log("[vpnConfig] Building WireGuard config:");
  console.log("[vpnConfig]   endpointOverride:", params.endpointOverride);
  console.log("[vpnConfig]   WG_ENDPOINT from env:", WG_ENDPOINT);
  console.log("[vpnConfig]   Final endpoint:", endpoint);
  console.log(
    "[vpnConfig]   serverPublicKeyOverride:",
    params.serverPublicKeyOverride,
  );
  console.log(
    "[vpnConfig]   WG_SERVER_PUBLIC_KEY from env:",
    WG_SERVER_PUBLIC_KEY,
  );
  console.log("[vpnConfig]   Final serverPublicKey:", serverPublicKey);

  // assignedIp may already include /32 suffix from server, so check before adding
  const address = params.assignedIp.includes("/")
    ? params.assignedIp
    : `${params.assignedIp}/32`;

  return [
    "[Interface]",
    `PrivateKey = ${params.privateKey}`,
    `Address = ${address}`,
    "DNS = 1.1.1.1",
    "",
    "[Peer]",
    serverPublicKey
      ? `PublicKey = ${serverPublicKey}`
      : "# PublicKey = <server-public-key>",
    "AllowedIPs = 0.0.0.0/0, ::/0",
    endpoint ? `Endpoint = ${endpoint}` : "# Endpoint = <hostname:51820>",
    "PersistentKeepalive = 25",
    "",
  ].join("\n");
}

export function buildOpenVpnConfig(params: {
  assignedIp: string;
  serverName: string;
}) {
  return [
    "client",
    "dev tun",
    "proto udp",
    `remote ${OVPN_REMOTE} ${OVPN_PORT}`,
    "resolv-retry infinite",
    "nobind",
    "persist-key",
    "persist-tun",
    "remote-cert-tls server",
    "cipher AES-256-GCM",
    "auth SHA256",
    "verb 3",
    `# Assigned IP hint: ${params.assignedIp}`,
    `# Server: ${params.serverName}`,
    "",
  ].join("\n");
}

export function buildIkev2Config(params: { serverName: string }) {
  return [
    "# Example strongSwan / IKEv2 configuration for vpnVPN.",
    `# Remote gateway: ${IKEV2_REMOTE}`,
    "",
    "conn vpnvpn",
    "  keyexchange=ikev2",
    "  type=tunnel",
    "  left=%any",
    "  leftauth=psk",
    `  right=${IKEV2_REMOTE}`,
    "  rightauth=psk",
    "  ike=aes256-sha256-modp2048!",
    "  esp=aes256-sha256!",
    "  leftsubnet=0.0.0.0/0",
    "  rightsubnet=0.0.0.0/0",
    "  auto=add",
    `# Server: ${params.serverName}`,
    "# PSK: <ask your administrator or see documentation>",
    "",
  ].join("\n");
}
