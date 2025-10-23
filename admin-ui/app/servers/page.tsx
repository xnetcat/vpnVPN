type Server = {
  id: string;
  region: string;
  status: string;
  sessions: number;
  cpu?: number;
};

async function getServers(): Promise<Server[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}/api/servers`,
    {
      cache: "no-store",
    }
  );
  return res.json();
}

export default async function ServersPage() {
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
