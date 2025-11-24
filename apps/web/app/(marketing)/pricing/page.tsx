import { TIERS } from "@/lib/tiers";
import { Check } from "lucide-react";
import SubscribeButton from "@/components/SubscribeButton";

export default function PricingPage() {
  const tiers = [TIERS.basic, TIERS.pro, TIERS.enterprise];

  return (
    <main className="mx-auto max-w-7xl p-6 text-slate-50">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-slate-50">
          Simple, Transparent Pricing
        </h1>
        <p className="text-lg text-slate-400">
          Choose the plan that fits your needs. All plans include unlimited
          bandwidth.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {tiers.map((tier, idx) => {
          const isPopular = idx === 1;
          return (
            <div
              key={tier.name}
              className={`relative rounded-lg border border-slate-800 bg-slate-900/80 p-8 shadow-sm shadow-slate-900/40 ${
                isPopular ? "ring-2 ring-emerald-500" : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1 text-sm font-medium text-slate-950">
                  Most Popular
                </div>
              )}

              <div className="text-center">
                <h2 className="mb-2 text-2xl font-semibold text-slate-50">
                  {tier.name}
                </h2>
                <div className="mb-6">
                  <span className="text-5xl font-bold text-slate-50">
                    ${tier.price}
                  </span>
                  <span className="text-slate-400">/month</span>
                </div>
              </div>

              <ul className="mb-8 space-y-4">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
                    <span className="text-slate-300">{feature}</span>
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

      <div className="mt-12 text-center text-sm text-slate-500">
        <p>All plans can be cancelled anytime. No hidden fees.</p>
      </div>
    </main>
  );
}
