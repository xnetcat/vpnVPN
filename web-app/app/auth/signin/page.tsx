"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const providers = [
  { id: "github", label: "Continue with GitHub" },
  { id: "google", label: "Continue with Google" },
];

function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleProviderSignIn = (providerId: string) => {
    void signIn(providerId, { callbackUrl });
  };

  return (
    <main className="flex min-h-[calc(100vh-65px)] items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-gray-600">
          Secure access to your vpnVPN account. We never log your traffic, only
          minimal metadata required to operate the service.
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

        <div className="mt-6 border-t pt-4">
          <p className="text-xs text-gray-500">
            By continuing you agree to vpnVPN&apos;s terms of service and
            acknowledge our strict no-logging policy.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[calc(100vh-65px)] items-center justify-center">Loading...</div>}>
      <SignInForm />
    </Suspense>
  );
}
