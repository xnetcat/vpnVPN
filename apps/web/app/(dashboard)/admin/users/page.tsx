import { requireAdmin } from "@/lib/requireAdmin";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminUsersPage() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    redirect(gate.reason === "unauthenticated" ? "/api/auth/signin" : "/");
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscriptions: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      devices: true,
    },
  });

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pb-10 pt-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          Directory
        </p>
        <h1 className="text-2xl font-semibold text-slate-50">Users</h1>
        <p className="text-sm text-slate-400">
          Overview of customers, subscription status, and device counts.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 shadow-xl shadow-black/20 backdrop-blur">
        <table className="min-w-full divide-y divide-slate-800">
          <thead className="bg-slate-900/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                Subscription
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                Devices
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((user: (typeof users)[number]) => {
              const sub = user.subscriptions[0];
              return (
                <tr key={user.id} className="bg-slate-950/40 hover:bg-slate-800/70">
                  <td className="px-4 py-3 text-sm text-slate-100">
                    {user.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {user.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {user.role}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {sub
                      ? `${sub.tier.toUpperCase()} • ${sub.status}`
                      : "No subscription"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {user.devices.length}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-slate-400"
                >
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
