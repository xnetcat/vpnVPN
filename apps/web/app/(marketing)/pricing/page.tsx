import { TIERS } from "@/lib/tiers";
import { Check } from "lucide-react";
import SubscribeButton from "@/components/SubscribeButton";

export default function PricingPage() {
  const tiers = [TIERS.basic, TIERS.pro, TIERS.enterprise];

  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-lg text-gray-600">
          Choose the plan that fits your needs. All plans include unlimited
          bandwidth.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {tiers.map((tier, idx) => {
          const isPopular = idx === 1;
          return (
            <div
              key={tier.name}
              className={`rounded-lg border bg-white p-8 shadow-sm relative ${
                isPopular ? "ring-2 ring-blue-600" : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </div>
              )}

              <div className="text-center">
                <h2 className="text-2xl font-semibold mb-2">{tier.name}</h2>
                <div className="mb-6">
                  <span className="text-5xl font-bold">${tier.price}</span>
                  <span className="text-gray-500">/month</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <SubscribeButton
                priceId={tier.priceId}
                tierName={tier.name}
                isPopular={isPopular}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-12 text-center text-sm text-gray-500">
        <p>All plans can be cancelled anytime. No hidden fees.</p>
      </div>
    </main>
  );
}
