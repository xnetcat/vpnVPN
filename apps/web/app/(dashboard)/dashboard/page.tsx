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
    <main className="mx-auto max-w-6xl p-6 text-slate-50">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
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
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-6 shadow-sm shadow-slate-900/40">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-400">
              Your Devices
            </div>
            <Smartphone className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-slate-50">{devices}</div>
          <p className="mt-1 text-xs text-slate-400">
            of {tierConfig.deviceLimit} allowed
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-6 shadow-sm shadow-slate-900/40">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-400">
              Available Servers
            </div>
            <Server className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-slate-50">
            {servers.online}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {servers.total} total servers
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-6 shadow-sm shadow-slate-900/40">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-400">
              Active Sessions
            </div>
            <Activity className="h-5 w-5 text-sky-400" />
          </div>
          <div className="text-3xl font-bold text-slate-50">
            {servers.totalSessions}
          </div>
          <p className="mt-1 text-xs text-slate-400">across all servers</p>
        </div>
      </div>

      {/* Subscription Status */}
      {subscription && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-6 shadow-sm shadow-slate-900/40">
          <h2 className="mb-4 text-lg font-semibold text-slate-50">
            Subscription Status
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <div className="mb-1 text-sm text-slate-400">Plan</div>
              <div className="font-medium text-slate-50">
                {tierConfig.name}
              </div>
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-400">Status</div>
              <div className="font-medium capitalize text-slate-50">
                {subscription.status}
              </div>
            </div>
            <div>
              <div className="mb-1 text-sm text-slate-400">Renews</div>
              <div className="font-medium text-slate-50">
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
        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/80 p-6 shadow-sm shadow-slate-900/40">
          <h2 className="mb-2 text-lg font-semibold text-slate-50">
            Current VPN configuration
          </h2>
          <p className="text-sm text-slate-400">
            Latest device:{" "}
            <span className="font-medium text-slate-100">
              {latestDevice.name}
            </span>{" "}
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
