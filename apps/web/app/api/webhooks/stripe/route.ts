import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { revokePeersForUser } from "@/lib/controlPlane";
import { sendEmail } from "@/lib/email";
import { getTierFromPriceId, getTierConfig } from "@/lib/tiers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing signature/secret" },
      { status: 400 },
    );
  }
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: `Webhook Error: ${error.message}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId: string | undefined =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription as Stripe.Subscription | null)?.id;
        const customerId: string | undefined =
          typeof session.customer === "string" ? session.customer : undefined;
        const userId: string | undefined = session.metadata?.userId;
        if (!subscriptionId || !customerId) break;
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items?.data?.[0]?.price?.id;
        const status = sub.status;
        const tier = priceId ? getTierFromPriceId(priceId) : "basic";
        const currentPeriodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : null;
        let user = null;
        if (userId) {
          user = await prisma.user.findUnique({ where: { id: userId } });
        }
        if (!user && customerId) {
          user = await prisma.user.findFirst({
            where: { stripeCustomerId: customerId },
          });
        }
        if (user) {
          await prisma.subscription.upsert({
            where: { stripeSubscriptionId: subscriptionId },
            update: {
              status,
              priceId: priceId ?? "",
              tier,
              currentPeriodEnd: currentPeriodEnd ?? undefined,
              userId: user.id,
            },
            create: {
              userId: user.id,
              stripeSubscriptionId: subscriptionId,
              priceId: priceId ?? "",
              status,
              tier,
              currentPeriodEnd: currentPeriodEnd ?? undefined,
            },
          });

          const isActive = status === "active" || status === "trialing";
          if (!isActive) {
            // Immediate cutoff: revoke all peers for this user.
            try {
              await revokePeersForUser(user.id);
            } catch (e) {
              console.error("Failed to revoke peers after checkout", {
                userId: user.id,
                error: e,
              });
            }
          } else if (user.email) {
            // Send subscription active email
            const tierConfig = getTierConfig(tier);
            await sendEmail({
              to: user.email,
              template: "subscription_active",
              data: {
                name: user.name,
                plan: tierConfig.name,
                deviceLimit: tierConfig.deviceLimit.toString(),
                nextBillingDate: currentPeriodEnd?.toLocaleDateString(),
                dashboardUrl: `${
                  process.env.NEXTAUTH_URL || "http://localhost:3000"
                }/dashboard`,
              },
            });
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subObj = event.data.object as Stripe.Subscription;
        const subscriptionId = subObj.id;
        const customerId: string | undefined =
          typeof subObj.customer === "string"
            ? subObj.customer
            : subObj.customer?.id;
        if (!customerId) break;
        const priceId = subObj.items?.data?.[0]?.price?.id;
        const status = subObj.status;
        const tier = priceId ? getTierFromPriceId(priceId) : "basic";
        const currentPeriodEnd = subObj.current_period_end
          ? new Date(subObj.current_period_end * 1000)
          : null;
        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        });
        if (user) {
          await prisma.subscription.upsert({
            where: { stripeSubscriptionId: subscriptionId },
            update: {
              status,
              priceId: priceId ?? "",
              tier,
              currentPeriodEnd: currentPeriodEnd ?? undefined,
              userId: user.id,
            },
            create: {
              userId: user.id,
              stripeSubscriptionId: subscriptionId,
              priceId: priceId ?? "",
              status,
              tier,
              currentPeriodEnd: currentPeriodEnd ?? undefined,
            },
          });

          const isActive = status === "active" || status === "trialing";
          if (!isActive) {
            // Immediate cutoff whenever Stripe marks a subscription as non-active.
            try {
              await revokePeersForUser(user.id);
            } catch (e) {
              console.error(
                "Failed to revoke peers after subscription update",
                {
                  userId: user.id,
                  error: e,
                },
              );
            }

            // Send cancellation email
            if (user.email && event.type === "customer.subscription.deleted") {
              await sendEmail({
                to: user.email,
                template: "subscription_cancelled",
                data: {
                  name: user.name,
                  pricingUrl: `${
                    process.env.NEXTAUTH_URL || "http://localhost:3000"
                  }/pricing`,
                },
              });
            }
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Stripe webhook error", err);
    return NextResponse.json({ received: true }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
