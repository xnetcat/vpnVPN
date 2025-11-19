import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export type GateResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "unauthenticated" | "payment_required" };

export const requirePaidUser = async (): Promise<GateResult> => {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return { ok: false, reason: "unauthenticated" };

  const sub = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["active", "trialing"] },
    },
  });
  if (!sub) return { ok: false, reason: "payment_required" };

  return { ok: true, userId };
};

export const gateApiOr = async () => {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    const status = gate.reason === "unauthenticated" ? 401 : 402;
    return NextResponse.json({ error: gate.reason }, { status });
  }
  return null;
};

