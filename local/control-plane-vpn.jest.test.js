const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

function getControlPlaneConfig() {
  const base =
    process.env.CONTROL_PLANE_API_URL ||
    process.env.CONTROL_PLANE_URL ||
    "http://localhost:4000";
  const apiKey = process.env.CONTROL_PLANE_API_KEY || "dev-control-plane-key";
  return { base, apiKey };
}

async function fetchServers({ base, apiKey }) {
  const normalized = base.replace(/\/$/, "");
  const serverUrl = `${normalized}/servers`;
  const res = await fetch(serverUrl, { headers: { "x-api-key": apiKey } });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`/servers failed: ${res.status} ${res.statusText} ${body}`);
  }
  return JSON.parse(body);
}

async function pickServerOrSkip(kind) {
  const { base, apiKey } = getControlPlaneConfig();
  let servers;
  try {
    servers = await fetchServers({ base, apiKey });
  } catch (err) {
    throw new Error(
      `[${kind}] control-plane unreachable or unauthorized. Set CONTROL_PLANE_API_URL and CONTROL_PLANE_API_KEY. Error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
  if (!Array.isArray(servers) || servers.length === 0) {
    console.warn(`[skip ${kind}] no servers returned from control-plane`);
    return null;
  }
  return servers;
}

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
    const { base: controlPlaneBase, apiKey: controlPlaneApiKey } =
      getControlPlaneConfig();
    const base = controlPlaneBase.replace(/\/$/, "");

    const servers = await pickServerOrSkip("wireguard");
    if (!servers) return;
    const server =
      servers.find((s) => (s.wgEndpoint || s.publicIp) && s.publicKey) ||
      servers[0];
    if (!server || !server.publicKey) {
      throw new Error("no WireGuard-capable server found");
    }
    if (!server.wgEndpoint && !server.publicIp) {
      throw new Error("missing wg endpoint/publicIp");
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
# Keep route to peer off-tunnel
ip route add "${"$"}{VPN_SERVER_ENDPOINT}/32" dev eth0 || true
ip route replace 0.0.0.0/0 dev wg0
echo "nameserver 1.1.1.1" > /etc/resolv.conf
echo "[client] wg show:"
wg show
echo "[client] ip addr:"
ip addr
echo "[client] ip route:"
ip route
echo "[client] ping endpoint ${"$"}{VPN_SERVER_ENDPOINT}"
ping -c 3 "${"$"}{VPN_SERVER_ENDPOINT}" || true
echo "[client] sleep 3s before internet ping"
sleep 3
echo "[client] wg show (post-wait):"
wg show
echo "[client] ping 8.8.8.8"
ping -c 5 8.8.8.8
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

describe("openvpn metadata", () => {
  test("control-plane exposes ovpn bundle", async () => {
    const { base: controlPlaneBase, apiKey: controlPlaneApiKey } =
      getControlPlaneConfig();
    const servers = await pickServerOrSkip("openvpn");
    const server =
      servers.find(
        (s) => s.ovpnCaBundle || (s.metadata && s.metadata.ovpnCaBundle)
      ) || servers[0];
    if (
      !server ||
      (!server.ovpnCaBundle &&
        !(server.metadata && server.metadata.ovpnCaBundle))
    ) {
      throw new Error("missing openvpn metadata");
    }

    const host = server.ovpnEndpoint || server.publicIp;
    const port = server.ovpnPort || 1194;
    if (!host) {
      throw new Error("openvpn host missing");
    }
    const ping = spawnSync("ping", ["-c", "1", host], { encoding: "utf8" });
    if (ping.status !== 0) {
      throw new Error(
        `openvpn endpoint unreachable (${host}:${port})\nstdout:\n${ping.stdout}\nstderr:\n${ping.stderr}`
      );
    }
  });
});

describe("ikev2 metadata and ipsec smoke", () => {
  test("control-plane exposes ikev2Remote metadata", async () => {
    const { base: controlPlaneBase, apiKey: controlPlaneApiKey } =
      getControlPlaneConfig();
    const servers = await pickServerOrSkip("ikev2");
    const server =
      servers.find(
        (s) => s.ikev2Remote || (s.metadata && s.metadata.ikev2Remote)
      ) || servers[0];
    if (
      !server ||
      (!server.ikev2Remote && !(server.metadata && server.metadata.ikev2Remote))
    ) {
      throw new Error("missing ikev2 metadata");
    }

    const remote = server.ikev2Remote || server.metadata?.ikev2Remote;
    const host = remote?.split(":")[0];
    if (!host) {
      throw new Error("ikev2 host missing");
    }
    const ping = spawnSync("ping", ["-c", "1", host], { encoding: "utf8" });
    if (ping.status !== 0) {
      throw new Error(
        `ikev2 endpoint unreachable (${remote})\nstdout:\n${ping.stdout}\nstderr:\n${ping.stderr}`
      );
    }
  }, 60_000);
});
