import { z } from "zod";
import { router, paidProcedure } from "../init";
import { WEB_ENV } from "@/env";
import { TRPCError } from "@trpc/server";
import {
  addPeerForDevice,
  revokePeerByPublicKey,
  revokePeersForUser,
} from "@/lib/controlPlane";
import { allocateDeviceIp } from "@/lib/networking";
import { getTierConfig } from "@/lib/tiers";
import { sendEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";
import nacl from "tweetnacl";


/**
 * Generate a WireGuard-compatible keypair using wg genkey.
 * This ensures keys are in the exact format WireGuard expects.
 *
 * Security note: Private keys are generated server-side and transmitted
 * to the client over HTTPS. The server does NOT store private keys.
 * For maximum security, consider generating keys client-side in the
 * desktop app using system wg genkey when available.
 */
async function generateWireGuardKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const { execSync } = await import("child_process");

  try {
    // Use wg genkey for proper WireGuard key format
    const privateKey = execSync("wg genkey", { encoding: "utf-8" }).trim();
    // Derive public key from private key
    const publicKey = execSync("wg pubkey", {
      encoding: "utf-8",
      input: privateKey,
    }).trim();

    return { publicKey, privateKey };
  } catch (error) {
    // Fallback to NaCl if wg command is not available (e.g., in Docker)
    console.warn(
      "[device] wg genkey not available, falling back to NaCl key generation",
      error
    );
    const keyPair = nacl.box.keyPair();
    const publicKey = Buffer.from(keyPair.publicKey).toString("base64");
    const privateKey = Buffer.from(keyPair.secretKey).toString("base64");
    // Ensure proper padding (wg genkey always produces 44-char keys)
    const normalizedPrivateKey =
      privateKey.length === 43 ? `${privateKey}=` : privateKey;
    const normalizedPublicKey =
      publicKey.length === 43 ? `${publicKey}=` : publicKey;
    return {
      publicKey: normalizedPublicKey,
      privateKey: normalizedPrivateKey,
    };
  }
}

function buildWireguardConfig(params: {
  server: any;
  assignedIp: string;
  privateKey: string;
}) {
  const { server, assignedIp, privateKey } = params;
  const endpointHost = server.wgEndpoint || server.publicIp;
  const port =
    server.wgPort ??
    (server.metadata as any)?.listenPort ??
    (server.metadata as any)?.port ??
    51820;
  if (!endpointHost || !server.publicKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Server missing WireGuard endpoint or public key",
    });
  }

  const address = assignedIp.includes("/") ? assignedIp : `${assignedIp}/32`;
  const endpoint = `${endpointHost}:${port}`;

  return [
    "[Interface]",
    `PrivateKey = ${privateKey}`,
    `Address = ${address}`,
    "DNS = 1.1.1.1, 1.0.0.1",
    "",
    "[Peer]",
    `PublicKey = ${server.publicKey}`,
    "AllowedIPs = 0.0.0.0/0, ::/0",
    `Endpoint = ${endpoint}`,
    "PersistentKeepalive = 25",
    "",
  ].join("\n");
}

function buildOpenVpnConfig(params: {
  server: any;
  assignedIp: string;
  serverName: string;
}) {
  const { server, assignedIp, serverName } = params;
  const endpoint = server.ovpnEndpoint || server.publicIp;
  const port =
    server.ovpnPort ??
    (server.metadata as any)?.listenPort ??
    (server.metadata as any)?.port ??
    1194;

  if (!endpoint) {
    return null;
  }

  const caBundle = server.ovpnCaBundle ?? null;
  const peerFingerprint = server.ovpnPeerFingerprint ?? null;
  if (!caBundle && !peerFingerprint) {
    return null;
  }

  const lines = [
    "client",
    "dev tun",
    "proto udp",
    `remote ${endpoint} ${port}`,
    "resolv-retry infinite",
    "nobind",
    "persist-key",
    "persist-tun",
    "remote-cert-tls server",
    peerFingerprint
      ? `peer-fingerprint ${peerFingerprint}`
      : "# peer-fingerprint <hex>",
    "cipher AES-256-GCM",
    "data-ciphers AES-256-GCM:CHACHA20-POLY1305",
    "tls-version-min 1.2",
    "auth-user-pass vpnvpn-auth.txt",
    "auth SHA256",
    "verb 3",
    `# Assigned IP hint: ${assignedIp}`,
    `# Server: ${serverName}`,
    "",
  ];

  if (caBundle) {
    lines.push("<ca>");
    lines.push(caBundle);
    lines.push("</ca>");
  }

  // Embed tls-crypt key if available (required by the server)
  const tlsCryptKey =
    server.tlsCryptKey ?? (server.metadata as any)?.tlsCryptKey ?? null;
  if (tlsCryptKey) {
    lines.push("<tls-crypt>");
    lines.push(tlsCryptKey);
    lines.push("</tls-crypt>");
  }

  return lines.join("\n");
}

function buildIkev2Config(params: {
  server: any;
  serverName: string;
  username?: string;
  password?: string;
}) {
  const { server, serverName, username, password } = params;
  const remote = server.ikev2Remote || server.publicIp;
  if (!remote) return null;
  // Strip port from remote if present (e.g. "1.2.3.4:500" → "1.2.3.4")
  const remoteHost = remote.includes(":") ? remote.split(":")[0] : remote;

  const caBundle = server.ovpnCaBundle ?? null;

  const lines = [
    "# vpnVPN IKEv2 configuration (EAP-MSCHAPv2)",
    `# Remote gateway: ${remoteHost}`,
    "",
    "conn vpnvpn",
    "  keyexchange=ikev2",
    "  type=tunnel",
    "  left=%any",
    "  leftauth=eap-mschapv2",
    username ? `  eap_identity=${username}` : "  eap_identity=%identity",
    `  right=${remoteHost}`,
    `  rightid=${remoteHost}`,
    "  rightauth=pubkey",
    '  rightca="CN=vpnvpn-ca"',
    "  rightsubnet=0.0.0.0/0",
    "  ike=aes256-sha256-modp2048!",
    "  esp=aes256gcm128!",
    "  auto=add",
    `# Server: ${serverName}`,
    "",
  ];

  if (caBundle) {
    lines.push("# CA certificate (save as /etc/ipsec.d/cacerts/ca.pem):");
    lines.push(`# ${caBundle.replace(/\n/g, "\n# ")}`);
  }

  if (username && password) {
    lines.push(`# Secrets (add to /etc/ipsec.secrets):`);
    lines.push(`# ${username} : EAP "${password}"`);
  }

  return lines.join("\n");
}

export const deviceRouter = router({
  list: paidProcedure.query(async ({ ctx }) => {
    const devices = await ctx.prisma.device.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
    });
    return devices;
  }),

  // Step 1: Register device - creates or updates device and peer, but doesn't send email
  // Device starts in "pending" status until connection is confirmed
  // If machineId is provided and a device with that machineId already exists for
  // this user, the existing device is updated instead of creating a new one
  register: paidProcedure
    .input(
      z.object({
        name: z.string().min(1),
        serverId: z.string().optional(),
        machineId: z.string().optional(),
        // Optional: if provided, use client-generated public key (more secure)
        // If not provided, generate keys server-side (for web clients)
        publicKey: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { name, serverId, machineId } = input;

      if (!serverId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "serverId is required",
        });
      }

      // First check the local DB
      let serverRecord = await ctx.prisma.vpnServer.findUnique({
        where: { id: serverId },
      });

      // If not in DB, fetch from control plane and upsert
      if (!serverRecord) {
        const base = WEB_ENV.CONTROL_PLANE_API_URL?.replace(/\/$/, "");
        const apiKey = WEB_ENV.CONTROL_PLANE_API_KEY;

        if (!base || !apiKey) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Control plane not configured",
          });
        }

        const res = await fetch(`${base}/servers`, {
          method: "GET",
          headers: { "x-api-key": apiKey },
          cache: "no-store",
        });

        if (!res.ok) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "VPN server not found or offline",
          });
        }

        const servers: any[] = await res.json();
        const cpServer = servers.find((s: any) => s.id === serverId);

        if (!cpServer) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "VPN server not found or offline",
          });
        }

        // Upsert the server into the local DB so future lookups work
        serverRecord = await ctx.prisma.vpnServer.upsert({
          where: { id: serverId },
          update: {
            publicIp: cpServer.publicIp || null,
            publicKey: cpServer.publicKey || null,
            wgEndpoint: cpServer.wgEndpoint || cpServer.metadata?.wgEndpoint || null,
            wgPort: cpServer.wgPort || cpServer.metadata?.wgPort || null,
            ovpnEndpoint: cpServer.ovpnEndpoint || cpServer.metadata?.ovpnEndpoint || null,
            ovpnPort: cpServer.ovpnPort || cpServer.metadata?.ovpnPort || null,
            ovpnCaBundle: cpServer.ovpnCaBundle || cpServer.metadata?.ovpnCaBundle || null,
            ovpnPeerFingerprint: cpServer.ovpnPeerFingerprint || cpServer.metadata?.ovpnPeerFingerprint || null,
            ikev2Remote: cpServer.ikev2Remote || cpServer.metadata?.ikev2Remote || null,
            status: cpServer.status || "online",
            lastSeen: cpServer.lastSeen ? new Date(cpServer.lastSeen) : new Date(),
            metadata: cpServer.metadata || {},
          },
          create: {
            id: serverId,
            publicIp: cpServer.publicIp || null,
            publicKey: cpServer.publicKey || null,
            wgEndpoint: cpServer.wgEndpoint || cpServer.metadata?.wgEndpoint || null,
            wgPort: cpServer.wgPort || cpServer.metadata?.wgPort || null,
            ovpnEndpoint: cpServer.ovpnEndpoint || cpServer.metadata?.ovpnEndpoint || null,
            ovpnPort: cpServer.ovpnPort || cpServer.metadata?.ovpnPort || null,
            ovpnCaBundle: cpServer.ovpnCaBundle || cpServer.metadata?.ovpnCaBundle || null,
            ovpnPeerFingerprint: cpServer.ovpnPeerFingerprint || cpServer.metadata?.ovpnPeerFingerprint || null,
            ikev2Remote: cpServer.ikev2Remote || cpServer.metadata?.ikev2Remote || null,
            status: cpServer.status || "online",
            lastSeen: cpServer.lastSeen ? new Date(cpServer.lastSeen) : new Date(),
            metadata: cpServer.metadata || {},
          },
        });
      }

      if (!serverRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "VPN server not found or offline",
        });
      }

      if (!serverRecord.publicKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "VPN server is missing WireGuard public key",
        });
      }

      const serverMetadata =
        (serverRecord?.metadata as Record<string, unknown> | null) || null;
      const serverPort =
        (serverMetadata?.listenPort as number | undefined) ??
        (serverMetadata?.port as number | undefined);

      // Check if there's an existing device with this machineId
      let existingDevice = machineId
        ? await ctx.prisma.device.findFirst({
            where: {
              userId: ctx.userId,
              machineId,
            },
          })
        : null;

      // If device exists with this machineId, we'll update it instead of creating a new one
      // This prevents device limit issues when reconnecting from the same machine
      if (existingDevice) {
        console.log(
          "[device] Found existing device with machineId, updating:",
          {
            deviceId: existingDevice.id,
            machineId,
          }
        );

        // Revoke old peer and generate new keys
        try {
          await revokePeerByPublicKey(existingDevice.publicKey);
        } catch {
          // Ignore errors revoking old peer
        }

        const keyPair = await generateWireGuardKeyPair();
        const publicKey = keyPair.publicKey;
        const privateKey = keyPair.privateKey;

        // Update existing device with new keys
        const device = await ctx.prisma.device.update({
          where: { id: existingDevice.id },
          data: {
            publicKey,
            name,
            serverId,
            status: "pending",
          },
        });

        const assignedIp = allocateDeviceIp(ctx.userId, device.id);

        // Register with control plane
        try {
          await addPeerForDevice({
            publicKey,
            userId: ctx.userId,
            allowedIps: [assignedIp],
            serverId,
          });
        } catch (err) {
          console.error(
            "[device] control-plane addPeer failed for existing device",
            {
              err,
              userId: ctx.userId,
              deviceId: device.id,
            }
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to register device with VPN server",
          });
        }

        const wireguardConfig = buildWireguardConfig({
          server: { ...serverRecord, metadata: serverMetadata },
          assignedIp,
          privateKey,
        });
        const openvpnConfig = buildOpenVpnConfig({
          server: { ...serverRecord, metadata: serverMetadata },
          assignedIp,
          serverName: serverRecord.id,
        });
        const ikev2Config = buildIkev2Config({
          server: { ...serverRecord, metadata: serverMetadata },
          serverName: serverRecord.id,
          username: device.id,
          password: keyPair.privateKey.slice(0, 32),
        });

        return {
          deviceId: device.id,
          assignedIp,
          wireguardConfig,
          openvpnConfig,
          ikev2Config,
          vpnCredentials: {
            username: device.id,
            password: keyPair.privateKey.slice(0, 32),
          },
        };
      }

      // No existing device found - check device limit and create new one
      const tierConfig = getTierConfig(ctx.tier);
      const deviceCount = await ctx.prisma.device.count({
        where: {
          userId: ctx.userId,
          status: { not: "pending" },
        },
      });

      if (deviceCount >= tierConfig.deviceLimit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Device limit reached (${tierConfig.deviceLimit}). Please upgrade your plan or remove an existing device.`,
        });
      }

      // Clean up any old pending devices for this user (older than 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const oldPendingDevices = await ctx.prisma.device.findMany({
        where: {
          userId: ctx.userId,
          status: "pending",
          createdAt: { lt: tenMinutesAgo },
        },
      });

      for (const oldDevice of oldPendingDevices) {
        try {
          await revokePeerByPublicKey(oldDevice.publicKey);
        } catch {
          // Ignore errors revoking old peers
        }
        await ctx.prisma.device.delete({ where: { id: oldDevice.id } });
      }

      const keyPair = await generateWireGuardKeyPair();
      const publicKey = keyPair.publicKey;
      const privateKey = keyPair.privateKey;

      // Create device in database with "pending" status
      const device = await ctx.prisma.device.create({
        data: {
          userId: ctx.userId,
          publicKey,
          name,
          machineId, // Store machineId for future reconnections
          serverId,
          status: "pending", // Will be updated to "active" when confirmed
        },
      });

      const assignedIp = allocateDeviceIp(ctx.userId, device.id);

      // Generate OpenVPN/IKEv2 credentials
      const vpnUsername = device.id;
      const vpnPassword = require("crypto").randomBytes(16).toString("hex");

      // Register with control plane. We first revoke any existing peers for
      // this user so that only a single active VPN configuration is valid at
      // any given time.
      try {
        await revokePeersForUser(ctx.userId);
        await addPeerForDevice({
          publicKey,
          userId: ctx.userId,
          allowedIps: [assignedIp],
          // Pass through server affinity so the control plane can record it.
          serverId,
          // Capture the generated credentials for the control plane to verify
          username: vpnUsername,
          password: vpnPassword,
        });
      } catch (err) {
        // Clean up the device if control plane registration fails
        await ctx.prisma.device.delete({ where: { id: device.id } });

        console.error("[device] control-plane addPeer failed", {
          err,
          userId: ctx.userId,
          deviceId: device.id,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to register device with VPN server",
        });
      }

      // NOTE: Email is NOT sent here. It will be sent when confirmConnection is called.

      const wireguardConfig = buildWireguardConfig({
        server: { ...serverRecord, metadata: serverMetadata },
        assignedIp,
        privateKey,
      });
      const openvpnConfig = buildOpenVpnConfig({
        server: { ...serverRecord, metadata: serverMetadata },
        assignedIp,
        serverName: serverRecord.id,
      });
      const ikev2Config = buildIkev2Config({
        server: { ...serverRecord, metadata: serverMetadata },
        serverName: serverRecord.id,
        username: vpnUsername,
        password: vpnPassword,
      });

      return {
        deviceId: device.id,
        assignedIp,
        wireguardConfig,
        openvpnConfig,
        ikev2Config,
        vpnCredentials: {
          username: vpnUsername,
          password: vpnPassword,
        },
      };
    }),

  // Step 2: Confirm connection - called after VPN connection is verified
  // Marks device as active and sends confirmation email
  confirmConnection: paidProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const device = await ctx.prisma.device.findUnique({
        where: { id: input.deviceId },
      });

      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        });
      }

      if (device.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unauthorized",
        });
      }

      // Only update if still pending
      if (device.status === "pending") {
        await ctx.prisma.device.update({
          where: { id: device.id },
          data: {
            status: "active",
            lastConnectedAt: new Date(),
          },
        });

        // Send device added email only after successful connection
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.userId },
        });
        if (user?.email) {
          await sendEmail({
            to: user.email,
            template: "device_added",
            data: {
              name: user.name,
              deviceName: device.name,
              dashboardUrl: `${WEB_ENV.NEXTAUTH_URL}/devices`,
            },
          });
        }

        revalidatePath("/dashboard");
        revalidatePath("/devices");
      }

      return { success: true };
    }),

  // Cancel a pending connection - cleans up device that was never confirmed
  cancelConnection: paidProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const device = await ctx.prisma.device.findUnique({
        where: { id: input.deviceId },
      });

      if (!device) {
        // Device might already be deleted, that's fine
        return { success: true };
      }

      if (device.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unauthorized",
        });
      }

      // Only delete if still pending
      if (device.status === "pending") {
        try {
          await revokePeerByPublicKey(device.publicKey);
        } catch (err) {
          console.error("[device] control-plane revokePeer failed", {
            err,
            deviceId: input.deviceId,
          });
        }

        await ctx.prisma.device.delete({
          where: { id: device.id },
        });
      }

      return { success: true };
    }),

  revoke: paidProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const device = await ctx.prisma.device.findUnique({
        where: { id: input.deviceId },
      });

      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        });
      }

      if (device.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unauthorized",
        });
      }

      // Revoke from control plane
      try {
        await revokePeerByPublicKey(device.publicKey);
      } catch (err) {
        console.error("[device] control-plane revokePeer failed", {
          err,
          deviceId: input.deviceId,
        });
        // Continue anyway to remove from DB
      }

      // Delete from database
      await ctx.prisma.device.delete({
        where: { id: input.deviceId },
      });

      // Send device revoked email (only for active devices, not pending ones)
      if (device.status !== "pending") {
        const user = await ctx.prisma.user.findUnique({
          where: { id: ctx.userId },
        });
        if (user?.email) {
          await sendEmail({
            to: user.email,
            template: "device_revoked",
            data: {
              name: user.name,
              deviceName: device.name,
              dashboardUrl: `${WEB_ENV.NEXTAUTH_URL}/devices`,
            },
          });
        }
      }

      revalidatePath("/dashboard");
      revalidatePath("/devices");

      return { success: true };
    }),
});
