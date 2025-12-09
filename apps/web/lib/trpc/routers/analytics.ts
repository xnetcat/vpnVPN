import { z } from "zod";
import { router, adminProcedure } from "../init";

export const analyticsRouter = router({
  // Get summary statistics
  summary: adminProcedure.query(async ({ ctx }) => {
    const [
      totalUsers,
      activeSubscriptions,
      totalDevices,
      subscriptionsByTier,
      recentSignups,
    ] = await Promise.all([
      ctx.prisma.user.count(),
      ctx.prisma.subscription.count({
        where: { status: { in: ["active", "trialing"] } },
      }),
      ctx.prisma.device.count(),
      ctx.prisma.subscription.groupBy({
        by: ["tier"],
        where: { status: { in: ["active", "trialing"] } },
        _count: true,
      }),
      ctx.prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const tierBreakdown = subscriptionsByTier.reduce(
      (acc, item) => {
        acc[item.tier] = item._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalUsers,
      activeSubscriptions,
      totalDevices,
      tierBreakdown,
      recentSignups,
    };
  }),

  // Get historical metrics
  historicalMetrics: adminProcedure
    .input(
      z.object({
        period: z.enum(["24h", "7d", "30d"]).default("24h"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      let startDate: Date;
      let intervalMinutes: number;

      switch (input.period) {
        case "24h":
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          intervalMinutes = 60; // Hourly
          break;
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          intervalMinutes = 360; // 6-hourly
          break;
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          intervalMinutes = 1440; // Daily
          break;
      }

      const metrics = await ctx.prisma.vpnMetric.findMany({
        where: {
          timestamp: { gte: startDate },
        },
        orderBy: { timestamp: "asc" },
        select: {
          timestamp: true,
          activePeers: true,
          cpu: true,
          memory: true,
          region: true,
          serverId: true,
        },
      });

      // Group metrics by time intervals
      const buckets = new Map<
        string,
        {
          timestamp: Date;
          totalSessions: number;
          avgCpu: number;
          avgMemory: number;
          count: number;
        }
      >();

      for (const m of metrics) {
        const bucketTime = new Date(
          Math.floor(m.timestamp.getTime() / (intervalMinutes * 60 * 1000)) *
            intervalMinutes *
            60 *
            1000,
        );
        const key = bucketTime.toISOString();

        const existing = buckets.get(key);
        if (existing) {
          existing.totalSessions += m.activePeers ?? 0;
          existing.avgCpu += m.cpu ?? 0;
          existing.avgMemory += m.memory ?? 0;
          existing.count += 1;
        } else {
          buckets.set(key, {
            timestamp: bucketTime,
            totalSessions: m.activePeers ?? 0,
            avgCpu: m.cpu ?? 0,
            avgMemory: m.memory ?? 0,
            count: 1,
          });
        }
      }

      // Convert to array and calculate averages
      const timeSeries = Array.from(buckets.values())
        .map((b) => ({
          timestamp: b.timestamp.toISOString(),
          sessions: b.totalSessions,
          avgCpu: b.count > 0 ? b.avgCpu / b.count : 0,
          avgMemory: b.count > 0 ? b.avgMemory / b.count : 0,
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      return timeSeries;
    }),

  // Get geographic distribution
  geoDistribution: adminProcedure.query(async ({ ctx }) => {
    const servers = await ctx.prisma.vpnServer.findMany({
      include: {
        metrics: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    });

    const byRegion = new Map<
      string,
      { region: string; servers: number; sessions: number }
    >();

    for (const server of servers) {
      const metadata = (server.metadata as Record<string, unknown>) || {};
      const region =
        (metadata.region as string) || server.metrics[0]?.region || "Unknown";
      const sessions = server.metrics[0]?.activePeers ?? 0;

      const existing = byRegion.get(region);
      if (existing) {
        existing.servers += 1;
        existing.sessions += sessions;
      } else {
        byRegion.set(region, { region, servers: 1, sessions });
      }
    }

    return Array.from(byRegion.values()).sort((a, b) =>
      a.region.localeCompare(b.region),
    );
  }),

  // Get server health overview
  serverHealth: adminProcedure.query(async ({ ctx }) => {
    const servers = await ctx.prisma.vpnServer.findMany({
      include: {
        metrics: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    });

    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    const health = {
      online: 0,
      offline: 0,
      degraded: 0,
      total: servers.length,
    };

    for (const server of servers) {
      const lastSeen = server.lastSeen?.getTime() ?? 0;
      const metric = server.metrics[0];

      if (now - lastSeen > fiveMinutes) {
        health.offline += 1;
      } else if (
        metric &&
        ((metric.cpu ?? 0) > 90 || (metric.memory ?? 0) > 0.9)
      ) {
        health.degraded += 1;
      } else {
        health.online += 1;
      }
    }

    return health;
  }),

  // Get recent activity
  recentActivity: adminProcedure.query(async ({ ctx }) => {
    const [recentDevices, recentSubscriptions] = await Promise.all([
      ctx.prisma.device.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          createdAt: true,
          user: {
            select: { email: true },
          },
        },
      }),
      ctx.prisma.subscription.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          tier: true,
          status: true,
          createdAt: true,
          user: {
            select: { email: true },
          },
        },
      }),
    ]);

    return {
      recentDevices: recentDevices.map((d) => ({
        id: d.id,
        name: d.name,
        email: d.user.email,
        createdAt: d.createdAt.toISOString(),
      })),
      recentSubscriptions: recentSubscriptions.map((s) => ({
        id: s.id,
        tier: s.tier,
        status: s.status,
        email: s.user.email,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  }),
});




