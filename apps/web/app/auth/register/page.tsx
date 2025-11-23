"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const providers = [
  { id: "github", label: "Continue with GitHub" },
  { id: "google", label: "Continue with Google" },
];

function RegisterForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleProviderSignIn = (providerId: string) => {
    void signIn(providerId, { callbackUrl });
  };

  return (
    <main className="flex min-h-[calc(100vh-65px)] items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your vpnVPN account
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign up with your existing identity provider. The first successful
          sign-in will create your account and link it to billing.
        </p>

        <div className="mt-6 space-y-3">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleProviderSignIn(p.id)}
              className="flex w-full items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-6 border-t pt-4 text-sm text-gray-600">
          <p>
            Already have an account?{" "}
            <a
              href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="font-medium text-blue-600 hover:text-blue-800"
            >
              Sign in
            </a>
            .
          </p>
          <p className="mt-3 text-xs text-gray-500">
            We never log your traffic. We only store minimal metadata required
            to operate the VPN service and bill your subscription.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-65px)] items-center justify-center">
          Loading...
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}



