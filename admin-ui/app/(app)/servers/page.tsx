import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";

type Server = {
  id: string;
  region: string;
  status: string;
  sessions: number;
  cpu?: number;
};

async function getServers(): Promise<Server[]> {
  const res = await fetch(`/api/servers`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export default async function ServersPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing"
    );
  }
  const servers = await getServers();
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Servers</h1>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                ID
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Region
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Status
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                Sessions
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                CPU
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {servers.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm">{s.id}</td>
                <td className="px-4 py-2 text-sm">{s.region}</td>
                <td className="px-4 py-2 text-sm">{s.status}</td>
                <td className="px-4 py-2 text-sm">{s.sessions}</td>
                <td className="px-4 py-2 text-sm">
                  {typeof s.cpu === "number" ? `${s.cpu.toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}



