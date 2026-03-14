import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getTierConfig, type Tier } from "@/lib/tiers";

export type GateResult =
  | { ok: true; userId: string; tier: Tier; deviceLimit: number }
  | { ok: false; reason: "unauthenticated" | "payment_required" };

export const requirePaidUser = async (): Promise<GateResult> => {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return { ok: false, reason: "unauthenticated" };

  // Admin bypass: admins get enterprise-level access without a subscription
  const role = (session?.user as any)?.role as string | undefined;
  if (role === "admin") {
    const tierConfig = getTierConfig("enterprise");
    return { ok: true, userId, tier: "enterprise", deviceLimit: tierConfig.deviceLimit };
  }

  const sub = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["active", "trialing"] },
    },
  });
  if (!sub) return { ok: false, reason: "payment_required" };

  const tier = (sub.tier || "basic") as Tier;
  const tierConfig = getTierConfig(tier);

  return { ok: true, userId, tier, deviceLimit: tierConfig.deviceLimit };
};

export const gateApiOr = async () => {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    const status = gate.reason === "unauthenticated" ? 401 : 402;
    return NextResponse.json({ error: gate.reason }, { status });
  }
  return null;
};

export const checkDeviceLimit = async (
  userId: string,
): Promise<{ canAdd: boolean; current: number; limit: number }> => {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    return { canAdd: false, current: 0, limit: 0 };
  }

  const deviceCount = await prisma.device.count({
    where: { userId },
  });

  return {
    canAdd: deviceCount < gate.deviceLimit,
    current: deviceCount,
    limit: gate.deviceLimit,
  };
};
