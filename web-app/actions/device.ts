'use server'

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function registerDevice(publicKey: string, name: string) {
  const session = await getSession();
  if (!session?.user) {
    return { error: "Unauthorized" };
  }
  
  const userId = (session.user as any).id;

  try {
    const device = await prisma.device.create({
      data: {
        userId,
        publicKey,
        name,
      },
    });
    revalidatePath("/dashboard");
    return { success: true, device };
  } catch (error) {
    console.error("Failed to register device:", error);
    return { error: "Failed to register device" };
  }
}

