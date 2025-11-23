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

  register: paidProcedure
    .input(
      z.object({
        name: z.string().min(1),
        serverId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { name, serverId } = input;

      // Check device limit
      const tierConfig = getTierConfig(ctx.tier);
      const deviceCount = await ctx.prisma.device.count({
        where: { userId: ctx.userId },
      });

      if (deviceCount >= tierConfig.deviceLimit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Device limit reached (${tierConfig.deviceLimit}). Please upgrade your plan.`,
        });
      }

      // Generate WireGuard keypair on the server to avoid generating keys in the browser.
      const keyPair = nacl.box.keyPair();
      const publicKey = util.encodeBase64(keyPair.publicKey);
      const privateKey = util.encodeBase64(keyPair.secretKey);

      // Create device in database
      const device = await ctx.prisma.device.create({
        data: {
          userId: ctx.userId,
          publicKey,
          name,
          serverId,
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
        console.error("[device] control-plane addPeer failed", {
          err,
          userId: ctx.userId,
          deviceId: device.id,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Device saved locally but failed to register with control plane",
        });
      }

      // Send device added email
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
      });
      if (user?.email) {
        await sendEmail({
          to: user.email,
          template: "device_added",
          data: {
            name: user.name,
            deviceName: name,
            dashboardUrl: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/devices`,
          },
        });
      }

      revalidatePath("/dashboard");
      revalidatePath("/devices");

      return { deviceId: device.id, assignedIp, publicKey, privateKey };
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

      // Send device revoked email
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

      revalidatePath("/dashboard");
      revalidatePath("/devices");

      return { success: true };
    }),
});
