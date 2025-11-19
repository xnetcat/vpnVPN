import { prisma } from "@/lib/prisma";
import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";

export default async function AccountPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing"
    );
  }
  const sub = await prisma.subscription.findFirst({
    where: { userId: gate.userId },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Account</h1>
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Plan</div>
            <div className="text-lg font-medium">Pro</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Status</div>
            <div className="text-lg font-medium">
              {sub?.status ?? "unknown"}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Renews</div>
            <div className="text-lg font-medium">
              {sub?.currentPeriodEnd
                ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                : "—"}
            </div>
          </div>
        </div>
        <form action="/api/billing/portal" method="POST" className="mt-6">
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black"
            aria-label="Manage billing"
          >
            Manage billing
          </button>
        </form>
      </div>
    </main>
  );
}




