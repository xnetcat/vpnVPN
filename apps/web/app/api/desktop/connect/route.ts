import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { allocateDeviceIp } from "@/lib/networking";
import { addPeerForDevice, revokePeersForUser } from "@/lib/controlPlane";
import { getTierConfig } from "@/lib/tiers";
import { getSession } from "@/lib/auth";
import { WEB_ENV } from "@/env";

type Body = {
  publicKey?: string;
  deviceName?: string;
  serverId?: string;
};

const WG_ENDPOINT = WEB_ENV.NEXT_PUBLIC_WG_ENDPOINT;
const WG_SERVER_PUBLIC_KEY = WEB_ENV.NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY;

function buildWireGuardConfig(params: {
  privateKey: string;
  publicKey: string;
  assignedIp: string;
}) {
  const endpoint = WG_ENDPOINT;
  const serverPublicKey = WG_SERVER_PUBLIC_KEY;

  return [
    "[Interface]",
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

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ["active", "trialing"] } },
  });

  if (!sub) {
    return NextResponse.json({ error: "payment_required" }, { status: 402 });
  }

  const tierConfig = getTierConfig((sub.tier || "basic") as any);

  const body = (await req.json().catch(() => ({}))) as Body;
  const publicKey = body.publicKey;
  const deviceName = (body.deviceName || "Desktop device").slice(0, 128);
  const serverId = body.serverId;
  const privateKey = req.headers.get("x-vpn-private-key");

  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "missing_keys" }, { status: 400 });
  }

  if (!WG_SERVER_PUBLIC_KEY) {
    return NextResponse.json(
      {
        error: "server_missing_key",
        message:
          "VPN server public key is not configured. Please contact support.",
      },
      { status: 500 },
    );
  }

  const deviceCount = await prisma.device.count({
    where: { userId },
  });

  if (deviceCount >= tierConfig.deviceLimit) {
    return NextResponse.json(
      {
        error: "device_limit",
        message: `Device limit reached (${tierConfig.deviceLimit}). Please upgrade your plan.`,
      },
      { status: 403 },
    );
  }

  const device = await prisma.device.create({
    data: {
      userId,
      publicKey,
      name: deviceName,
      serverId,
    },
  });

  const assignedIp = allocateDeviceIp(userId, device.id);

  try {
    await revokePeersForUser(userId);
    await addPeerForDevice({
      publicKey,
      userId,
      allowedIps: [assignedIp],
      serverId,
    });
  } catch (err) {
    console.error("[desktop] addPeer failed", {
      err,
      userId,
      deviceId: device.id,
    });
    return NextResponse.json({ error: "control_plane_error" }, { status: 500 });
  }

  const config = buildWireGuardConfig({
    privateKey,
    publicKey,
    assignedIp,
  });

  return NextResponse.json({ config });
}
