import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AddDeviceModal from "@/components/AddDeviceModal";
import { getTierConfig } from "@/lib/tiers";
import { Server, Smartphone, Activity } from "lucide-react";

async function getDashboardData(userId: string) {
  const [devices, subscription, servers] = await Promise.all([
    prisma.device.count({ where: { userId } }),
    prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ["active", "trialing"] },
      },
    }),
    fetchServerMetrics(),
  ]);

  return { devices, subscription, servers };
}

async function fetchServerMetrics() {
  try {
    const base =
      process.env.CONTROL_PLANE_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
    const apiKey = process.env.CONTROL_PLANE_API_KEY;

    if (!base || !apiKey) {
      return { total: 0, online: 0, totalSessions: 0 };
    }

    const url = `${base.replace(/\/$/, "")}/servers`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      return { total: 0, online: 0, totalSessions: 0 };
    }

    const data = await res.json();
    const servers = data || [];

    const total = servers.length;
    const online = servers.filter((s: any) => s.status === "online").length;
    const totalSessions = servers.reduce(
      (sum: number, s: any) => sum + (s.metrics?.sessions || 0),
      0
    );

    return { total, online, totalSessions };
  } catch (err) {
    console.error("Failed to fetch server metrics", err);
    return { total: 0, online: 0, totalSessions: 0 };
  }
}

export default async function DashboardPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing"
    );
  }

  const { devices, subscription, servers } = await getDashboardData(
    gate.userId
  );
  const tierConfig = getTierConfig(gate.tier);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tierConfig.name} Plan • {devices} / {tierConfig.deviceLimit}{" "}
            devices
          </p>
        </div>
        <AddDeviceModal />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-8">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-500">
              Your Devices
            </div>
            <Smartphone className="h-5 w-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold">{devices}</div>
          <p className="text-xs text-gray-500 mt-1">
            of {tierConfig.deviceLimit} allowed
          </p>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-500">
              Available Servers
            </div>
            <Server className="h-5 w-5 text-green-500" />
          </div>
          <div className="text-3xl font-bold">{servers.online}</div>
          <p className="text-xs text-gray-500 mt-1">
            {servers.total} total servers
          </p>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-gray-500">
              Active Sessions
            </div>
            <Activity className="h-5 w-5 text-purple-500" />
          </div>
          <div className="text-3xl font-bold">{servers.totalSessions}</div>
          <p className="text-xs text-gray-500 mt-1">across all servers</p>
        </div>
      </div>

      {/* Subscription Status */}
      {subscription && (
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Subscription Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-gray-500 mb-1">Plan</div>
              <div className="font-medium">{tierConfig.name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Status</div>
              <div className="font-medium capitalize">
                {subscription.status}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Renews</div>
              <div className="font-medium">
                {subscription.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
