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
import * as util from "tweetnacl-util";

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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { name, serverId, machineId } = input;

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

        // Generate new WireGuard keypair
        const keyPair = nacl.box.keyPair();
        const publicKey = util.encodeBase64(keyPair.publicKey);
        const privateKey = util.encodeBase64(keyPair.secretKey);

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

        return { deviceId: device.id, assignedIp, publicKey, privateKey };
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

      // Generate WireGuard keypair on the server to avoid generating keys in the browser.
      const keyPair = nacl.box.keyPair();
      const publicKey = util.encodeBase64(keyPair.publicKey);
      const privateKey = util.encodeBase64(keyPair.secretKey);

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

      return { deviceId: device.id, assignedIp, publicKey, privateKey };
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
