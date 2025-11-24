import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";
import { createContext } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/routers/_app";

type ProxyItem = {
  proxyId: string;
  type: string;
  ip: string;
  port: number;
  latency?: number;
  score?: number;
  country?: string;
};

async function getProxies(): Promise<ProxyItem[]> {
  const ctx = await createContext();
  const caller = appRouter.createCaller(ctx);
  const proxies = await caller.proxies.list();
  return proxies;
}

export default async function ProxiesPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing",
    );
  }

  const proxies = await getProxies();
  return (
    <main className="mx-auto max-w-6xl p-6 text-slate-50">
      <h1 className="mb-4 text-2xl font-semibold text-slate-50">Proxy Pool</h1>
      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80 shadow-sm shadow-slate-900/40">
        <table className="min-w-full divide-y divide-slate-800">
          <thead className="bg-slate-900/80">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-400">
                IP
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-400">
                Port
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-400">
                Type
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-400">
                Country
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-400">
                Latency
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-400">
                Score
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {proxies.map((p) => (
              <tr key={p.proxyId} className="hover:bg-slate-800/80">
                <td className="px-4 py-2 text-sm text-slate-100">{p.ip}</td>
                <td className="px-4 py-2 text-sm text-slate-300">{p.port}</td>
                <td className="px-4 py-2 text-sm text-slate-300">{p.type}</td>
                <td className="px-4 py-2 text-sm text-slate-300">
                  {p.country ?? "—"}
                </td>
                <td className="px-4 py-2 text-sm text-slate-300">
                  {p.latency ?? "—"} ms
                </td>
                <td className="px-4 py-2 text-sm text-slate-300">
                  {p.score ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
