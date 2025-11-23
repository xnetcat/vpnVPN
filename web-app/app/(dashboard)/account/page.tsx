import { prisma } from "@/lib/prisma";
import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";
import ManageBillingButton from "@/components/ManageBillingButton";
import { revalidatePath } from "next/cache";

export default async function AccountPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing"
    );
  }

  const [sub, user, notifications] = await Promise.all([
    prisma.subscription.findFirst({
      where: { userId: gate.userId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findUnique({
      where: { id: gate.userId },
      select: { name: true, email: true },
    }),
    prisma.notificationPreferences.findUnique({
      where: { userId: gate.userId },
    }),
  ]);

  async function updateProfile(formData: FormData) {
    "use server";
    const gateInner = await requirePaidUser();
    if (!gateInner.ok) {
      redirect(
        gateInner.reason === "unauthenticated"
          ? "/api/auth/signin"
          : "/pricing"
      );
    }

    const name = (formData.get("name") as string | null)?.trim() || null;

    await prisma.user.update({
      where: { id: gateInner.userId },
      data: { name },
    });

    revalidatePath("/account");
  }

  async function updateNotifications(formData: FormData) {
    "use server";
    const gateInner = await requirePaidUser();
    if (!gateInner.ok) {
      redirect(
        gateInner.reason === "unauthenticated"
          ? "/api/auth/signin"
          : "/pricing"
      );
    }

    const marketing = formData.get("marketing") === "on";
    const transactional = formData.get("transactional") === "on";
    const security = formData.get("security") === "on";

    await prisma.notificationPreferences.upsert({
      where: { userId: gateInner.userId },
      update: { marketing, transactional, security },
      create: {
        userId: gateInner.userId,
        marketing,
        transactional,
        security,
      },
    });

    revalidatePath("/account");
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold mb-2">Account &amp; Settings</h1>

      {/* Subscription */}
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Subscription</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-8">
            <div>
              <div className="text-sm text-gray-500">Plan</div>
              <div className="text-lg font-medium">
                {sub?.tier ? sub.tier.toUpperCase() : "Unknown"}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Status</div>
              <div className="text-lg font-medium capitalize">
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
          <ManageBillingButton />
        </div>
      </section>

      {/* Profile */}
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Profile</h2>
        <form action={updateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              name="name"
              defaultValue={user?.name ?? ""}
              placeholder="Your name"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <div className="mt-1 text-sm text-gray-600">
              {user?.email ?? "Not set"}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Email is managed by your identity provider (GitHub, Google, or
              magic link) and cannot be changed here.
            </p>
          </div>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save profile
          </button>
        </form>
      </section>

      {/* Notifications */}
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Notification preferences</h2>
        <form action={updateNotifications} className="space-y-3">
          <label className="flex items-start gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              name="marketing"
              defaultChecked={notifications?.marketing ?? true}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              Marketing updates{" "}
              <span className="text-gray-500">
                (occasional product announcements and changelogs)
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              name="transactional"
              defaultChecked={notifications?.transactional ?? true}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              Transactional emails{" "}
              <span className="text-gray-500">
                (billing receipts, subscription changes, device added/removed)
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              name="security"
              defaultChecked={notifications?.security ?? true}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              Security alerts{" "}
              <span className="text-gray-500">
                (suspicious logins, abnormal VPN usage, and important security
                notices)
              </span>
            </span>
          </label>

          <button
            type="submit"
            className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save preferences
          </button>
        </form>
      </section>
    </main>
  );
}




