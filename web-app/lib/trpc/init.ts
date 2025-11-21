import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

export type Context = {
  session: Session | null;
  prisma: typeof prisma;
};

export const createContext = async (): Promise<Context> => {
  const session = await getSession();
  return {
    session,
    prisma,
  };
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Authenticated procedure
export const protectedProcedure = t.procedure.use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const userId = (ctx.session.user as any).id;
  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return opts.next({
    ctx: {
      ...ctx,
      userId,
    },
  });
});

// Paid user procedure
export const paidProcedure = protectedProcedure.use(async (opts) => {
  const { ctx } = opts;
  const subscription = await ctx.prisma.subscription.findFirst({
    where: {
      userId: ctx.userId,
      status: { in: ["active", "trialing"] },
    },
  });

  if (!subscription) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Active subscription required",
    });
  }

  const tier = (subscription.tier || "basic") as "basic" | "pro" | "enterprise";
  
  return opts.next({
    ctx: {
      ...ctx,
      subscription,
      tier,
    },
  });
});

// Admin procedure
export const adminProcedure = protectedProcedure.use(async (opts) => {
  const { ctx } = opts;
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { role: true },
  });

  if (!user || user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }

  return opts.next({
    ctx: {
      ...ctx,
      isAdmin: true,
    },
  });
});

