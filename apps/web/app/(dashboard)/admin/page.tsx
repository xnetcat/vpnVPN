import { requireAdmin } from "@/lib/requireAdmin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Server, Key, Settings, Users, BarChart3 } from "lucide-react";
import { createContext } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/routers/_app";

type NodeSummary = {
  id: string;
  status: string;
  lastSeen?: string;
  activeSessions?: number;
};

async function fetchNodes(): Promise<NodeSummary[]> {
  try {
    const ctx = await createContext();
    const caller = appRouter.createCaller(ctx);
    const data = await caller.admin.listServers();

    return (data as any[]).map((item) => ({
      id: item.id ?? "unknown",
      status: item.status ?? "unknown",
      lastSeen: item.lastSeen,
      activeSessions:
        (item.metrics && item.metrics.sessions) ?? item.activeSessions,
    }));
  } catch (err) {
    console.error("[admin] fetchNodes error", { err });
    return [];
  }
}

export default async function AdminPage() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    redirect(gate.reason === "unauthenticated" ? "/api/auth/signin" : "/");
  }

  const nodes = await fetchNodes();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Admin Panel</h1>
        <p className="text-sm text-gray-500">Manage servers, tokens, and system configuration</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Link
          href="/admin/tokens"
          className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-blue-100 p-2">
              <Key className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="font-semibold">Server Tokens</h3>
          </div>
          <p className="text-sm text-gray-600">
            Manage registration tokens for VPN servers
          </p>
        </Link>

        <Link
          href="/admin/provision"
          className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-green-100 p-2">
              <Server className="h-5 w-5 text-green-600" />
            </div>
            <h3 className="font-semibold">Provision Server</h3>
          </div>
          <p className="text-sm text-gray-600">
            Deploy new VPN servers to your infrastructure
          </p>
        </Link>

        <Link
          href="/admin/users"
          className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-indigo-100 p-2">
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
            <h3 className="font-semibold">Users</h3>
          </div>
          <p className="text-sm text-gray-600">
            Inspect users, subscriptions, and device counts
          </p>
        </Link>

        <Link
          href="/admin/vpn-metrics"
          className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-orange-100 p-2">
              <BarChart3 className="h-5 w-5 text-orange-600" />
            </div>
            <h3 className="font-semibold">VPN Metrics</h3>
          </div>
          <p className="text-sm text-gray-600">
            View aggregated sessions and load by server and country
          </p>
        </Link>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-purple-100 p-2">
              <Settings className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="font-semibold">System Status</h3>
          </div>
          <p className="text-sm text-gray-600">
            {nodes.filter((n) => n.status === "online").length} / {nodes.length} servers online
          </p>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-semibold">Server Fleet</h2>
      </div>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                ID
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Status
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Last Seen
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Active Sessions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {nodes.map((n) => (
              <tr key={n.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm">{n.id}</td>
                <td className="px-4 py-2 text-sm">{n.status}</td>
                <td className="px-4 py-2 text-sm">
                  {n.lastSeen ?? "—"}
                </td>
                <td className="px-4 py-2 text-sm">
                  {typeof n.activeSessions === "number"
                    ? n.activeSessions
                    : "—"}
                </td>
              </tr>
            ))}
            {nodes.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  No nodes registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}


