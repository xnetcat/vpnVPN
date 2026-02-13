"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const providers = [
  { id: "github", label: "Continue with GitHub" },
  { id: "google", label: "Continue with Google" },
];

function RegisterForm() {
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get("callbackUrl") || "/dashboard";

  const isDesktopParam = searchParams.get("desktop") === "1";
  const isDesktopShell =
    typeof window !== "undefined" &&
    typeof (window as any).__TAURI__?.core?.invoke === "function";

  const defaultCallback =
    typeof window !== "undefined"
      ? `${window.location.origin}/dashboard`
      : "/dashboard";

  const callbackUrl =
    isDesktopParam && rawCallback === "/dashboard"
      ? defaultCallback
      : rawCallback;

  const [email, setEmail] = useState("");
  const [magicState, setMagicState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [magicError, setMagicError] = useState<string | null>(null);

  const handleProviderSignIn = async (providerId: string) => {
    if (isDesktopShell && isDesktopParam) {
      try {
        const result = await signIn(providerId, {
          callbackUrl,
          redirect: false,
        });
        const url = (result as any)?.url as string | undefined;
        if (url) {
          const anyWin = window as any;
          await anyWin.__TAURI__.shell.open(url);
          return;
        }
      } catch (err) {
        console.error("desktop OAuth register failed", err);
      }
    }

    void signIn(providerId, { callbackUrl });
  };

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setMagicState("sending");
    setMagicError(null);
    try {
      const result = await signIn("email", {
        email,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setMagicState("error");
        setMagicError("Failed to send magic link. Please try again.");
        return;
      }

      setMagicState("sent");
    } catch (err) {
      console.error("magic link register failed", err);
      setMagicState("error");
      setMagicError("Something went wrong. Please try again.");
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-65px)] items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your vpnVPN account
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign up with a one-time magic link sent to your email, or use an
          existing identity provider. The first successful sign-in will create
          your account and link it to billing.
        </p>

        <form onSubmit={handleMagicLinkSubmit} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Email magic link
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <button
            type="submit"
            disabled={magicState === "sending"}
            className="flex w-full items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {magicState === "sending"
              ? "Sending magic link..."
              : "Send magic link"}
          </button>
          {magicState === "sent" && (
            <p className="text-xs text-green-600">
              Magic link sent. Check your inbox to complete sign-up.
            </p>
          )}
          {magicState === "error" && magicError && (
            <p className="text-xs text-red-600">{magicError}</p>
          )}
        </form>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs uppercase tracking-wide text-gray-400">
            Or continue with
          </span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <div className="mt-4 space-y-3">
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
              href={`/auth/signin?callbackUrl=${encodeURIComponent(
                callbackUrl,
              )}${isDesktopParam ? "&desktop=1" : ""}`}
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
