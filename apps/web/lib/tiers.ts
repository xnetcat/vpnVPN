export type Tier = "basic" | "pro" | "enterprise";

export interface TierConfig {
  name: string;
  price: number;
  priceId: string;
  deviceLimit: number;
  features: string[];
}

export const TIERS: Record<Tier, TierConfig> = {
  basic: {
    name: "Basic",
    price: 10,
    priceId: process.env.STRIPE_PRICE_ID_BASIC || "",
    deviceLimit: 1,
    features: [
      "1 device",
      "Access to all servers",
      "Unlimited bandwidth",
      "Email support",
    ],
  },
  pro: {
    name: "Pro",
    price: 30,
    priceId: process.env.STRIPE_PRICE_ID_PRO || "",
    deviceLimit: 5,
    features: [
      "5 devices",
      "Access to all servers",
      "Unlimited bandwidth",
      "Priority support",
      "Advanced metrics",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: 1000,
    priceId: process.env.STRIPE_PRICE_ID_ENTERPRISE || "",
    deviceLimit: 999,
    features: [
      "Unlimited devices",
      "Access to all servers",
      "Unlimited bandwidth",
      "Dedicated support",
      "Advanced metrics",
      "Custom integrations",
    ],
  },
};

export function getTierFromPriceId(priceId: string): Tier {
  for (const [tier, config] of Object.entries(TIERS)) {
    if (config.priceId === priceId) {
      return tier as Tier;
    }
  }
  return "basic"; // default fallback
}

export function getTierConfig(tier: Tier): TierConfig {
  return TIERS[tier];
}
