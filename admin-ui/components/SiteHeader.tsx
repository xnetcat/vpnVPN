import Link from "next/link";
import { getSession } from "@/lib/auth";

export default async function SiteHeader() {
  const session = await getSession();
  const authed = Boolean((session?.user as any)?.id);
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
        <Link
          href={authed ? "/dashboard" : "/"}
          className="text-lg font-semibold"
        >
          vpnVPN
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {authed ? (
            <>
              <Link
                href="/dashboard"
                className="hover:text-gray-900 text-gray-600"
              >
                Dashboard
              </Link>
              <Link
                href="/servers"
                className="hover:text-gray-900 text-gray-600"
              >
                Servers
              </Link>
              <Link
                href="/proxies"
                className="hover:text-gray-900 text-gray-600"
              >
                Proxies
              </Link>
              <Link
                href="/account"
                className="hover:text-gray-900 text-gray-600"
              >
                Account
              </Link>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="rounded-md border px-3 py-1 hover:bg-gray-50"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/pricing"
                className="hover:text-gray-900 text-gray-600"
              >
                Pricing
              </Link>
              <Link
                href="/api/auth/signin"
                className="rounded-md bg-gray-900 px-3 py-1 text-white hover:bg-black"
              >
                Sign in
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}



