import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing"
    );
  }
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Active Sessions</div>
          <div className="text-3xl font-bold">—</div>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Bytes Transferred</div>
          <div className="text-3xl font-bold">—</div>
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Nodes Healthy</div>
          <div className="text-3xl font-bold">—</div>
        </div>
      </div>
    </main>
  );
}


