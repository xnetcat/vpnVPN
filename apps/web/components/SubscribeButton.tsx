"use client";

import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";

export default function SubscribeButton({
  priceId,
  tierName,
  isPopular,
}: {
  priceId: string;
  tierName: string;
  isPopular: boolean;
}) {
  const router = useRouter();

  const createCheckout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error) => {
      alert(`Failed to create checkout: ${error.message}`);
    },
  });

  const handleSubscribe = () => {
    createCheckout.mutate({ priceId });
  };

  return (
    <button
      onClick={handleSubscribe}
      disabled={createCheckout.isPending}
      className={`w-full rounded-md px-4 py-3 font-medium disabled:opacity-50 ${
        isPopular
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "bg-gray-100 text-gray-900 hover:bg-gray-200"
      }`}
      aria-label={`Subscribe to ${tierName}`}
    >
      {createCheckout.isPending ? "Loading..." : "Get Started"}
    </button>
  );
}
