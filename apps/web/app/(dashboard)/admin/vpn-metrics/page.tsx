import { requireAdmin } from "@/lib/requireAdmin";
import { redirect } from "next/navigation";
import { createContext } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/routers/_app";

type ServerMetric = {
  id: string;
  country?: string;
  region?: string;
  status: string;
  sessions: number;
};

export default async function AdminVpnMetricsPage() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    redirect(gate.reason === "unauthenticated" ? "/api/auth/signin" : "/");
  }

  const ctx = await createContext();
  const caller = appRouter.createCaller(ctx);
  const raw = (await caller.admin.listServers()) as any[];

  const servers: ServerMetric[] = raw.map((s) => ({
    id: s.id ?? "unknown",
    country: s.country ?? s.metadata?.country,
    region: s.region ?? s.metadata?.region,
    status: s.status ?? "unknown",
    sessions:
      (s.metrics && typeof s.metrics.sessions === "number"
        ? s.metrics.sessions
        : 0) || 0,
  }));

  const totalSessions = servers.reduce((sum, s) => sum + (s.sessions || 0), 0);
  const onlineServers = servers.filter((s) => s.status === "online").length;

  const byCountry = servers.reduce<Record<string, number>>((acc, s) => {
    const key = s.country || "Unknown";
    acc[key] = (acc[key] || 0) + (s.sessions || 0);
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">VPN Metrics</h1>
        <p className="text-sm text-gray-500">
          Aggregate sessions and load by server and country.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">Online servers</div>
          <div className="text-3xl font-bold">{onlineServers}</div>
          <p className="text-xs text-gray-500 mt-1">
            of {servers.length} registered servers
          </p>
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">Active sessions</div>
          <div className="text-3xl font-bold">{totalSessions}</div>
          <p className="text-xs text-gray-500 mt-1">
            current sessions across all protocols
          </p>
        </div>
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500 mb-1">Countries</div>
          <div className="text-3xl font-bold">
            {Object.keys(byCountry).length}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            based on server metadata reported at registration
          </p>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Sessions by country</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Country
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Sessions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {Object.entries(byCountry).map(([country, sessions]) => (
                <tr key={country}>
                  <td className="px-4 py-2 text-sm text-gray-700">{country}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {sessions}
                  </td>
                </tr>
              ))}
              {Object.keys(byCountry).length === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-6 text-center text-sm text-gray-500"
                  >
                    No metrics available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Per-server detail</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  ID
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Country
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Region
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Sessions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {servers.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 text-sm font-mono text-gray-500">
                    {s.id}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {s.country ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {s.region ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {s.status}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {s.sessions}
                  </td>
                </tr>
              ))}
              {servers.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-gray-500"
                  >
                    No servers registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
