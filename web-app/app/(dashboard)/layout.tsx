import Link from "next/link";
import { LayoutDashboard, Server, Shield, User, ShieldCheck, Smartphone } from "lucide-react";
import { getSession } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession();
  const isAdmin = Boolean((session?.user as any)?.role === "admin");

  return (
    <div className="flex min-h-[calc(100vh-65px)]">
      <aside className="w-64 border-r bg-white hidden md:block">
        <nav className="space-y-1 p-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <LayoutDashboard className="h-4 w-4" />
            Overview
          </Link>
          <Link
            href="/devices"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <Smartphone className="h-4 w-4" />
            Devices
          </Link>
          <Link
            href="/servers"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <Server className="h-4 w-4" />
            Servers
          </Link>
          <Link
            href="/proxies"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <Shield className="h-4 w-4" />
            Proxies
          </Link>
          <Link
            href="/account"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <User className="h-4 w-4" />
            Account
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          )}
        </nav>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  )
}

