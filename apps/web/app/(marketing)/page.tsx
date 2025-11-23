import Link from "next/link";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();
  const isAuthed = Boolean((session?.user as any)?.id);
  return (
    <main className="mx-auto max-w-5xl p-6">
      <section className="text-center py-16">
        <h1 className="text-4xl font-bold tracking-tight">
          Secure VPN access for teams
        </h1>
        <p className="mt-4 text-gray-600">
          Pay monthly to access our VPN servers and proxy pool.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          {isAuthed ? (
            <Link
              href="/dashboard"
              className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/auth/register"
                className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black"
              >
                Get Started
              </Link>
              <Link
                href="/pricing"
                className="rounded-md border px-4 py-2 hover:bg-gray-50"
              >
                View Pricing
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
