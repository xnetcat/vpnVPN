import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.redirect(new URL("/api/auth/signin", req.url));
  }
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!process.env.STRIPE_SECRET_KEY || !priceId) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });
    customerId = customer.id;
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: customerId,
    success_url: new URL("/dashboard?checkout=success", req.url).toString(),
    cancel_url: new URL("/pricing?checkout=cancelled", req.url).toString(),
    allow_promotion_codes: true,
    metadata: { userId },
  });

  if (!checkout.url)
    return NextResponse.json({ error: "No checkout URL" }, { status: 500 });
  return NextResponse.redirect(checkout.url, { status: 303 });
}



