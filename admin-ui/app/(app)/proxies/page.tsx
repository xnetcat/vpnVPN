import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";

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
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const res = await fetch(`${base}/proxies`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export default async function ProxiesPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing"
    );
  }
  const proxies = await getProxies();
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Proxy Pool</h1>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                IP
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Port
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Type
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Latency
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Score
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {proxies.map((p) => (
              <tr key={p.proxyId} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm">{p.ip}</td>
                <td className="px-4 py-2 text-sm">{p.port}</td>
                <td className="px-4 py-2 text-sm">{p.type}</td>
                <td className="px-4 py-2 text-sm">{p.latency ?? "—"} ms</td>
                <td className="px-4 py-2 text-sm">{p.score ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}




