const ENV = import.meta.env as any;
const WG_ENDPOINT = (ENV?.VITE_WG_ENDPOINT as string) || "";
const WG_SERVER_PUBLIC_KEY = (ENV?.VITE_WG_SERVER_PUBLIC_KEY as string) || "";
const OVPN_REMOTE = (ENV?.VITE_OVPN_REMOTE as string) || "<vpn-hostname>";
const OVPN_PORT = (ENV?.VITE_OVPN_PORT as string) || "1194";
const IKEV2_REMOTE = (ENV?.VITE_IKEV2_REMOTE as string) || "<vpn-hostname>";

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
  endpointOverride?: string;
  portOverride?: number;
  caBundleOverride?: string | null;
  peerFingerprintOverride?: string | null;
}) {
  const endpoint =
    params.endpointOverride && params.endpointOverride.trim()
      ? params.endpointOverride.trim()
      : OVPN_REMOTE;
  const port =
    typeof params.portOverride === "number" &&
    !Number.isNaN(params.portOverride)
      ? params.portOverride
      : Number(OVPN_PORT) || 1194;

  const caBundle =
    params.caBundleOverride?.trim() ??
    import.meta.env.VITE_OVPN_CA_BUNDLE?.trim() ??
    import.meta.env.VITE_OVPN_CA?.trim() ??
    "";
  const peerFingerprint =
    params.peerFingerprintOverride?.trim() ??
    import.meta.env.VITE_OVPN_PEER_FINGERPRINT?.trim() ??
    "";

  const lines = [
    "client",
    "dev tun",
    "proto udp",
    endpoint ? `remote ${endpoint} ${port}` : "# remote <vpn-hostname> 1194",
    "resolv-retry infinite",
    "nobind",
    "persist-key",
    "persist-tun",
    "remote-cert-tls server",
    peerFingerprint
      ? `peer-fingerprint ${peerFingerprint}`
      : "# peer-fingerprint <hex>",
    "cipher AES-256-GCM",
    "auth SHA256",
    "verb 3",
    `# Assigned IP hint: ${params.assignedIp}`,
    `# Server: ${params.serverName}`,
    "",
  ];

  if (caBundle) {
    lines.push("<ca>");
    lines.push(caBundle);
    lines.push("</ca>");
  } else {
    lines.push(
      "# CA bundle not configured - provide VITE_OVPN_CA_BUNDLE or VITE_OVPN_PEER_FINGERPRINT",
    );
  }

  return lines.join("\n");
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
    "  leftauth=eap-mschapv2",
    "  eap_identity=%identity",
    `  right=${IKEV2_REMOTE}`,
    "  rightauth=pubkey",
    "  ike=aes256gcm16-prfsha256-ecp256!",
    "  esp=aes256gcm16-prfsha256-ecp256!",
    "  leftsubnet=0.0.0.0/0",
    "  rightsubnet=0.0.0.0/0",
    "  auto=add",
    `# Server: ${params.serverName}`,
    "# Credentials: use your VPN username/password",
    "",
  ].join("\n");
}
