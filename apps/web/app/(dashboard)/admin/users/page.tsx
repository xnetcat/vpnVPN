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
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1">Users</h1>
        <p className="text-sm text-gray-500">
          Overview of customers, subscription status, and device counts.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Role
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Subscription
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Devices
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {users.map((user: (typeof users)[number]) => {
              const sub = user.subscriptions[0];
              return (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {user.email ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {user.name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {user.role}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {sub
                      ? `${sub.tier.toUpperCase()} • ${sub.status}`
                      : "No subscription"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {user.devices.length}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-sm text-gray-500"
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

