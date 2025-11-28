import Link from "next/link";
import {
  LayoutDashboard,
  Server,
  Shield,
  User,
  ShieldCheck,
  Smartphone,
  Key,
  Users,
  BarChart3,
  Activity,
  Plus,
} from "lucide-react";
import { getSession } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const isAdmin = Boolean((session?.user as any)?.role === "admin");

  return (
    <div className="flex min-h-[calc(100vh-65px)] bg-slate-950">
      <aside className="hidden w-64 border-r border-slate-800 bg-slate-900/80 md:block">
        <nav className="space-y-1 p-4 text-sm text-slate-300">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Overview
          </Link>
          <Link
            href="/devices"
            className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
          >
            <Smartphone className="h-4 w-4" />
            Devices
          </Link>
          <Link
            href="/servers"
            className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
          >
            <Server className="h-4 w-4" />
            Servers
          </Link>
          <Link
            href="/proxies"
            className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
          >
            <Shield className="h-4 w-4" />
            Proxies
          </Link>
          <Link
            href="/account"
            className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
          >
            <User className="h-4 w-4" />
            Account
          </Link>
          {isAdmin && (
            <>
              <div className="my-3 border-t border-slate-800" />
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Admin
              </p>
              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
              >
                <ShieldCheck className="h-4 w-4" />
                Overview
              </Link>
              <Link
                href="/admin/tokens"
                className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
              >
                <Key className="h-4 w-4" />
                Server Tokens
              </Link>
              <Link
                href="/admin/provision"
                className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
              >
                <Plus className="h-4 w-4" />
                Provision Server
              </Link>
              <Link
                href="/admin/users"
                className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
              >
                <Users className="h-4 w-4" />
                Users
              </Link>
              <Link
                href="/admin/analytics"
                className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
              >
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Link>
              <Link
                href="/admin/vpn-metrics"
                className="flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:bg-slate-800 hover:text-slate-50"
              >
                <Activity className="h-4 w-4" />
                VPN Metrics
              </Link>
            </>
          )}
        </nav>
      </aside>
      <main className="flex-1 bg-slate-950">{children}</main>
    </div>
  );
}
