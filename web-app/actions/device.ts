'use server'

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { addPeerForDevice } from "@/lib/controlPlane";
import { allocateDeviceIp } from "@/lib/networking";
import { requirePaidUser } from "@/lib/requirePaidUser";

type RegisterDeviceResult =
  | { success: true; deviceId: string; assignedIp: string }
  | { success: false; error: string };

export async function registerDevice(
  publicKey: string,
  name: string
): Promise<RegisterDeviceResult> {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    return {
      success: false,
      error:
        gate.reason === "unauthenticated"
          ? "Unauthorized"
          : "Subscription required",
    };
  }

  const userId = gate.userId;

  try {
    const device = await prisma.device.create({
      data: {
        userId,
        publicKey,
        name,
      },
    });

    const assignedIp = allocateDeviceIp(userId, device.id);

    try {
      await addPeerForDevice({
        publicKey,
        userId,
        allowedIps: [assignedIp],
      });
    } catch (err) {
      console.error("[device] control-plane addPeer failed", {
        err,
        userId,
        deviceId: device.id,
      });
      return {
        success: false,
        error:
          "Device saved locally but failed to register with control plane",
      };
    }

    console.log("[device] registered", {
      userId,
      deviceId: device.id,
    });

    revalidatePath("/dashboard");

    return { success: true, deviceId: device.id, assignedIp };
  } catch (error) {
    console.error("[device] failed to register", { error });
    return { success: false, error: "Failed to register device" };
  }
}


