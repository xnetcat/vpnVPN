import { WEB_ENV } from "@/env";

export function buildWireGuardConfig(params: {
  privateKey: string;
  assignedIp: string;
  serverPublicKeyOverride?: string;
}) {
  const endpoint = WEB_ENV.NEXT_PUBLIC_WG_ENDPOINT;
  const serverPublicKey =
    params.serverPublicKeyOverride || WEB_ENV.NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY;

  return [
    "[Interface]",
    "Name = vpnvpn-desktop",
    `PrivateKey = ${params.privateKey}`,
    `Address = ${params.assignedIp}`,
    "DNS = 1.1.1.1",
    "",
    "[Peer]",
    serverPublicKey
      ? `PublicKey = ${serverPublicKey}`
      : "# PublicKey = <server-public-key>",
    "AllowedIPs = 0.0.0.0/0, ::/0",
    endpoint ? `Endpoint = ${endpoint}` : "# Endpoint = <hostname:51820>",
    "",
  ].join("\n");
}

export function buildOpenVpnConfig(params: {
  assignedIp: string;
  serverName: string;
}) {
  const remote = WEB_ENV.NEXT_PUBLIC_OVPN_REMOTE;
  const port = WEB_ENV.NEXT_PUBLIC_OVPN_PORT;

  return [
    "client",
    "dev tun",
    "proto udp",
    `remote ${remote} ${port}`,
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
  const remote = WEB_ENV.NEXT_PUBLIC_IKEV2_REMOTE;

  return [
    "# Example strongSwan / IKEv2 configuration for vpnVPN.",
    `# Remote gateway: ${remote}`,
    "",
    "conn vpnvpn",
    "  keyexchange=ikev2",
    "  type=tunnel",
    "  left=%any",
    "  leftauth=psk",
    `  right=${remote}`,
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
