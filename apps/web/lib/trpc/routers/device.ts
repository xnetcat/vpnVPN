import { z } from "zod";
import { router, paidProcedure } from "../init";
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
import { prisma } from "@vpnvpn/db";

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
      error,
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { name, serverId, machineId, publicKey: clientPublicKey } = input;

      const serverRecord = serverId
        ? await prisma.vpnServer.findUnique({ where: { id: serverId } })
        : null;

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
          },
        );

        // Revoke old peer and generate new keys
        try {
          await revokePeerByPublicKey(existingDevice.publicKey);
        } catch {
          // Ignore errors revoking old peer
        }

        // Use client-provided public key if available, otherwise generate server-side
        let publicKey: string;
        let privateKey: string | undefined;

        if (clientPublicKey) {
          // Client generated the keypair - more secure, private key never leaves client
          publicKey = clientPublicKey;
          privateKey = undefined; // Not returned to client
        } else {
          // Generate keys server-side (for web clients)
          const keyPair = await generateWireGuardKeyPair();
          publicKey = keyPair.publicKey;
          privateKey = keyPair.privateKey;
        }

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
            },
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to register device with VPN server",
          });
        }

        // Only return privateKey if it was generated server-side (for web clients)
        // Desktop clients generate keys locally and don't need it
        return {
          deviceId: device.id,
          assignedIp,
          publicKey,
          serverPublicKey: serverRecord.publicKey,
          serverEndpoint: serverRecord?.publicIp ?? null,
          serverPort: serverPort ?? null,
          ...(privateKey ? { privateKey } : {}),
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

      // Use client-provided public key if available, otherwise generate server-side
      let publicKey: string;
      let privateKey: string | undefined;

      if (clientPublicKey) {
        // Client generated the keypair - more secure, private key never leaves client
        publicKey = clientPublicKey;
        privateKey = undefined; // Not returned to client
      } else {
        // Generate keys server-side (for web clients)
        const keyPair = await generateWireGuardKeyPair();
        publicKey = keyPair.publicKey;
        privateKey = keyPair.privateKey;
      }

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

      // Only return privateKey if it was generated server-side (for web clients)
      // Desktop clients generate keys locally and don't need it
      return {
        deviceId: device.id,
        assignedIp,
        publicKey,
        serverPublicKey: serverRecord.publicKey,
        serverEndpoint: serverRecord?.publicIp ?? null,
        serverPort: serverPort ?? null,
        ...(privateKey ? { privateKey } : {}),
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
              dashboardUrl: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/devices`,
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
              dashboardUrl: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/devices`,
            },
          });
        }
      }

      revalidatePath("/dashboard");
      revalidatePath("/devices");

      return { success: true };
    }),
});
