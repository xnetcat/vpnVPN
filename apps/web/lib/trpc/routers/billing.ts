import { z } from "zod";
import { router, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { stripe } from "@/lib/stripe";
import { TIERS } from "@/lib/tiers";
import { WEB_ENV } from "@/env";

export const billingRouter = router({
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        priceId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!WEB_ENV.STRIPE_SECRET_KEY) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe not configured",
        });
      }

      const priceId = input.priceId || TIERS.pro.priceId;

      if (!priceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No price ID provided",
        });
      }

      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          metadata: { userId: user.id },
        });
        await ctx.prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customer.id },
        });
        customerId = customer.id;
      }

      const baseUrl = WEB_ENV.NEXTAUTH_URL;
      const checkout = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer: customerId,
        success_url: `${baseUrl}/dashboard?checkout=success`,
        cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
        allow_promotion_codes: true,
        metadata: { userId: ctx.userId },
      });

      if (!checkout.url) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No checkout URL generated",
        });
      }

      return { url: checkout.url };
    }),

  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    if (!WEB_ENV.STRIPE_SECRET_KEY) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Stripe not configured",
      });
    }

    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
    });

    if (!user?.stripeCustomerId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No Stripe customer found",
      });
    }

    const baseUrl = WEB_ENV.NEXTAUTH_URL;
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${baseUrl}/account`,
    });

    return { url: portal.url };
  }),
});
