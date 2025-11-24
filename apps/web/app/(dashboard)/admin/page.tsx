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
  region?: string;
  country?: string;
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
      region: item.region ?? item.metadata?.region,
      country: item.country ?? item.metadata?.country,
    }));
  } catch (err) {
    console.error("[admin] fetchNodes error", { err });
    return [];
  }
}

type AdminPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const gate = await requireAdmin();
  if (!gate.ok) {
    redirect(gate.reason === "unauthenticated" ? "/api/auth/signin" : "/");
  }

  const nodes = await fetchNodes();

  const resolvedSearch =
    (searchParams && (await searchParams)) || ({} as Record<string, string | string[] | undefined>);

  const statusFilter =
    (resolvedSearch.status as string | undefined)?.toLowerCase() || "all";
  const regionFilter =
    (resolvedSearch.region as string | undefined)?.toLowerCase() || "all";
  const q = (resolvedSearch.q as string | undefined)?.toLowerCase() || "";

  const filteredNodes = nodes.filter((n) => {
    if (statusFilter !== "all" && n.status.toLowerCase() !== statusFilter) {
      return false;
    }
    if (
      regionFilter !== "all" &&
      (n.region ?? "").toLowerCase() !== regionFilter
    ) {
      return false;
    }
    if (q) {
      const haystack = [
        n.id,
        n.status,
        n.region ?? "",
        n.country ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const allRegions = Array.from(
    new Set(
      nodes
        .map((n) => n.region?.toLowerCase())
        .filter((r): r is string => Boolean(r)),
    ),
  ).sort();

  const onlineCount = nodes.filter((n) => n.status === "online").length;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Admin Panel</h1>
        <p className="text-sm text-gray-500">
          Manage servers, tokens, and system configuration
        </p>
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
            {onlineCount} / {nodes.length} servers online
          </p>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-semibold">Server Fleet</h2>
      </div>
      <form className="mb-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
        <label className="flex items-center gap-2">
          <span>Status</span>
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span>Region</span>
          <select
            name="region"
            defaultValue={regionFilter}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            {allRegions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 flex-1 min-w-[180px]">
          <span className="whitespace-nowrap">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="ID, country, region…"
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Apply
        </button>
      </form>

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
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Region
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Country
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredNodes.map((n) => (
              <tr key={n.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm">{n.id}</td>
                <td className="px-4 py-2 text-sm">{n.status}</td>
                <td className="px-4 py-2 text-sm">{n.lastSeen ?? "—"}</td>
                <td className="px-4 py-2 text-sm">
                  {typeof n.activeSessions === "number"
                    ? n.activeSessions
                    : "—"}
                </td>
                <td className="px-4 py-2 text-sm">{n.region ?? "—"}</td>
                <td className="px-4 py-2 text-sm">{n.country ?? "—"}</td>
              </tr>
            ))}
            {filteredNodes.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  No nodes match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
