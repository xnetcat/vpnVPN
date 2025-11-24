import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AddDeviceModal from "@/components/AddDeviceModal";
import { getTierConfig } from "@/lib/tiers";
import { Server, Smartphone, Activity } from "lucide-react";
import { createContext } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/routers/_app";

async function getDashboardData(userId: string) {
  const [devices, subscription, serversMetrics, latestDevice] =
    await Promise.all([
      prisma.device.count({ where: { userId } }),
      prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ["active", "trialing"] },
        },
      }),
      fetchServerMetrics(),
      prisma.device.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  return {
    devices,
    subscription,
    servers: serversMetrics,
    latestDevice,
  };
}

async function fetchServerMetrics() {
  try {
    const ctx = await createContext();
    const caller = appRouter.createCaller(ctx);
    const servers = await caller.servers.list();

    const total = servers.length;
    const online = servers.filter(
      (s: (typeof servers)[number]) => s.status === "online",
    ).length;
    const totalSessions = servers.reduce(
      (sum: number, s: (typeof servers)[number]) => sum + (s.sessions || 0),
      0,
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
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing",
    );
  }

  const { devices, subscription, servers, latestDevice } =
    await getDashboardData(gate.userId);
  const tierConfig = getTierConfig(gate.tier);
  const canAddDevice = devices < tierConfig.deviceLimit;

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
        <AddDeviceModal
          canAdd={canAddDevice}
          current={devices}
          limit={tierConfig.deviceLimit}
        />
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

      {/* Current VPN */}
      {latestDevice && (
        <div className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-2">
            Current VPN configuration
          </h2>
          <p className="text-sm text-gray-600">
            Latest device:{" "}
            <span className="font-medium">{latestDevice.name}</span>{" "}
            {latestDevice.serverId
              ? `connected via server ${latestDevice.serverId}`
              : "(auto-selected server)"}{" "}
            using a single active set of credentials. Adding a new device or
            regenerating a config will automatically revoke older credentials.
          </p>
        </div>
      )}
    </main>
  );
}
