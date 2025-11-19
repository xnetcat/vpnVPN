export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-semibold text-center mb-8">Pricing</h1>
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-xl font-semibold">Pro</h2>
            <p className="text-gray-500">
              Full access to VPN servers and proxy pool
            </p>
          </div>
          <div className="text-3xl font-bold tracking-tight">
            ${"$"}9
            <span className="text-base font-normal text-gray-500">/mo</span>
          </div>
        </div>
        <ul className="mt-6 space-y-2 text-sm text-gray-700">
          <li>Unlimited bandwidth</li>
          <li>Global regions</li>
          <li>Cancel anytime</li>
        </ul>
        <form action="/api/billing/checkout" method="POST" className="mt-8">
          <button
            type="submit"
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black"
            aria-label="Subscribe to Pro"
          >
            Subscribe
          </button>
        </form>
      </div>
    </main>
  );
}




