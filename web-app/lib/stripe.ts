import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  // Avoid throwing during build; runtime routes that need Stripe should validate.
  // This placeholder client will still type-check but should not be used without a key.
}

export const stripe = new Stripe(stripeSecretKey || "sk_test_placeholder", {
  apiVersion: "2023-10-16",
});

