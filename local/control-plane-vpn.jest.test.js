const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function ensureKeyPair() {
  const priv = spawnSync("wg", ["genkey"], { encoding: "utf8" });
  if (priv.status !== 0 || !priv.stdout.trim()) {
    throw new Error(
      `failed to generate WireGuard private key: ${priv.stderr || priv.stdout}`
    );
  }
  const privKey = priv.stdout.trim();
  const pub = spawnSync("wg", ["pubkey"], { input: privKey, encoding: "utf8" });
  if (pub.status !== 0 || !pub.stdout.trim()) {
    throw new Error(
      `failed to derive WireGuard public key: ${pub.stderr || pub.stdout}`
    );
  }
  return { privKey, pubKey: pub.stdout.trim() };
}

describe("control-plane -> docker WG ping", () => {
  test("fetch server, register peer, ping google.com", async () => {
    const prisma = new PrismaClient();
    let userId;
    const controlPlaneBase =
      process.env.CONTROL_PLANE_API_URL || process.env.CONTROL_PLANE_URL;
    const controlPlaneApiKey = process.env.CONTROL_PLANE_API_KEY;

    if (!controlPlaneBase || !controlPlaneApiKey) {
      throw new Error("CONTROL_PLANE_API_URL or CONTROL_PLANE_API_KEY missing");
    }

    const base = controlPlaneBase.replace(/\/$/, "");
    const serverUrl = `${base}/servers`;

    const serversRes = await fetch(serverUrl, {
      headers: { "x-api-key": controlPlaneApiKey },
    });
    const serversBody = await serversRes.text();
    if (!serversRes.ok) {
      throw new Error(
        `/servers failed: ${serversRes.status} ${serversRes.statusText} ${serversBody}`
      );
    }
    const servers = JSON.parse(serversBody);
    const server =
      servers.find((s) => (s.wgEndpoint || s.publicIp) && s.publicKey) ||
      servers[0];
    if (!server || !server.publicKey) {
      throw new Error("no WireGuard-capable server found");
    }

    // Validate metadata presence for all protocols
    if (!server.wgEndpoint && !server.publicIp) {
      throw new Error("missing wg endpoint/publicIp");
    }
    if (
      !server.ikev2Remote &&
      !(server.metadata && server.metadata.ikev2Remote)
    ) {
      throw new Error("missing ikev2 metadata");
    }
    if (
      !server.ovpnCaBundle &&
      !(server.metadata && server.metadata.ovpnCaBundle)
    ) {
      throw new Error("missing openvpn metadata");
    }

    const { privKey, pubKey } = ensureKeyPair();
    const clientAddress = process.env.VPN_CLIENT_ADDRESS || "10.8.0.2/32";
    const testEmail =
      process.env.CONTROL_PLANE_TEST_EMAIL || "local-jest@vpnvpn.dev";
    const testName = process.env.CONTROL_PLANE_TEST_NAME || "Local Jest User";

    try {
      const user = await prisma.user.upsert({
        where: { email: testEmail },
        update: { name: testName },
        create: { email: testEmail, name: testName },
      });
      userId = user.id;
    } catch (err) {
      await prisma.$disconnect();
      throw new Error(
        `failed to ensure test user (apply migrations or set DATABASE_URL to a DB with the User table): ${err}`
      );
    }

    const addPeerRes = await fetch(`${base}/peers`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": controlPlaneApiKey,
      },
      body: JSON.stringify({
        publicKey: pubKey,
        userId,
        allowedIps: [clientAddress],
        serverId: server.id,
      }),
    });
    const addPeerBody = await addPeerRes.text();
    if (!addPeerRes.ok) {
      await prisma.$disconnect();
      throw new Error(
        `/peers failed: ${addPeerRes.status} ${addPeerRes.statusText} ${addPeerBody}`
      );
    }

    const endpointHost = server.wgEndpoint || server.publicIp;
    const endpointPort = server.wgPort || 51820;
    if (!endpointHost) {
      throw new Error("server missing endpoint");
    }

    const script = `
set -euo pipefail
trap 'ip route del 0.0.0.0/0 dev wg0 2>/dev/null || true; ip link del wg0 2>/dev/null || true; rm -f /tmp/wg-privkey' EXIT

ip link add wg0 type wireguard
printf "%s" "${"$"}{VPN_TEST_CLIENT_PRIVATE_KEY}" > /tmp/wg-privkey
wg set wg0 \\
  private-key /tmp/wg-privkey \\
  peer "${"$"}{VPN_SERVER_PUBLIC_KEY}" \\
  allowed-ips "${"$"}{VPN_ALLOWED_IPS:-0.0.0.0/0,::/0}" \\
  endpoint "${"$"}{VPN_SERVER_ENDPOINT}:${"$"}{VPN_SERVER_PORT:-51820}" \\
  persistent-keepalive "${"$"}{VPN_PERSISTENT_KEEPALIVE:-15}"

ip addr add "${"$"}{VPN_CLIENT_ADDRESS:-10.8.0.2/32}" dev wg0
ip link set wg0 up
ip route replace 0.0.0.0/0 dev wg0
echo "nameserver 1.1.1.1" > /etc/resolv.conf
ping -c 3 8.8.8.8
`;

    const result = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "--cap-add=NET_ADMIN",
        "--device",
        "/dev/net/tun",
        "--entrypoint",
        "/bin/bash",
        "-e",
        "VPN_ALLOWED_IPS",
        "-e",
        "VPN_PING_TARGET",
        "-e",
        "VPN_PERSISTENT_KEEPALIVE",
        "-e",
        "VPN_CLIENT_DNS",
        "-e",
        "VPN_CLIENT_ADDRESS",
        "-e",
        "VPN_TEST_CLIENT_PRIVATE_KEY",
        "-e",
        "VPN_SERVER_PUBLIC_KEY",
        "-e",
        "VPN_SERVER_ENDPOINT",
        "-e",
        "VPN_SERVER_PORT",
        "local-vpn-test-client",
        "-c",
        script,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          CONTROL_PLANE_API_KEY: controlPlaneApiKey,
          CONTROL_PLANE_API_URL: controlPlaneBase,
          VPN_TEST_CLIENT_PRIVATE_KEY: privKey,
          VPN_SERVER_PUBLIC_KEY: server.publicKey,
          VPN_SERVER_ENDPOINT: endpointHost,
          VPN_SERVER_PORT: String(endpointPort),
          VPN_ALLOWED_IPS: "0.0.0.0/0,::/0",
          VPN_PING_TARGET: "google.com",
          VPN_CLIENT_ADDRESS: clientAddress,
        },
        timeout: 60_000,
      }
    );

    if (result.status !== 0) {
      await prisma.$disconnect();
      throw new Error(
        `docker wg ping failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
    }
    await prisma.$disconnect();
  }, 120_000);
});
