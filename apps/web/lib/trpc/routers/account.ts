import { router, protectedProcedure } from "../init";
import { z } from "zod";

export const accountRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    const [subscription, user, notificationPreferences] = await Promise.all([
      ctx.prisma.subscription.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      }),
      ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      }),
      ctx.prisma.notificationPreferences.findUnique({
        where: { userId },
      }),
    ]);

    return {
      subscription,
      user,
      notificationPreferences,
    };
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;
      await ctx.prisma.user.update({
        where: { id: userId },
        data: { name: input.name ?? null },
      });
      return { success: true };
    }),

  updateNotifications: protectedProcedure
    .input(
      z.object({
        marketing: z.boolean(),
        transactional: z.boolean(),
        security: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.userId;

      await ctx.prisma.notificationPreferences.upsert({
        where: { userId },
        update: {
          marketing: input.marketing,
          transactional: input.transactional,
          security: input.security,
        },
        create: {
          userId,
          marketing: input.marketing,
          transactional: input.transactional,
          security: input.security,
        },
      });

      return { success: true };
    }),
});
