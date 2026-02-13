import Stripe from "stripe";
import { WEB_ENV } from "@/env";

const stripeSecretKey = WEB_ENV.STRIPE_SECRET_KEY;

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2024-06-20",
});
