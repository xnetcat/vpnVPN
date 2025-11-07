import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing signature/secret" },
      { status: 400 }
    );
  }
  const body = await req.text();

  let event: any;
  try {
    // @ts-ignore Stripe type import provided via devDependency
    event = (await (stripe as any).webhooks.constructEvent(
      body,
      sig,
      webhookSecret
    )) as any;
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any; // Checkout.Session
        const subscriptionId: string | undefined =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        const customerId: string | undefined = session.customer as
          | string
          | undefined;
        const userId: string | undefined = session.metadata?.userId;
        if (!subscriptionId || !customerId) break;
        const sub = await (stripe as any).subscriptions.retrieve(
          subscriptionId
        );
        const priceId = sub.items?.data?.[0]?.price?.id as string | undefined;
        const status = sub.status as string;
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
              currentPeriodEnd: currentPeriodEnd ?? undefined,
              userId: user.id,
            },
            create: {
              userId: user.id,
              stripeSubscriptionId: subscriptionId,
              priceId: priceId ?? "",
              status,
              currentPeriodEnd: currentPeriodEnd ?? undefined,
            },
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subObj = event.data.object as any; // Stripe.Subscription
        const subscriptionId = subObj.id as string;
        const customerId = subObj.customer as string;
        const priceId = subObj.items?.data?.[0]?.price?.id as
          | string
          | undefined;
        const status = subObj.status as string;
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
              currentPeriodEnd: currentPeriodEnd ?? undefined,
              userId: user.id,
            },
            create: {
              userId: user.id,
              stripeSubscriptionId: subscriptionId,
              priceId: priceId ?? "",
              status,
              currentPeriodEnd: currentPeriodEnd ?? undefined,
            },
          });
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
