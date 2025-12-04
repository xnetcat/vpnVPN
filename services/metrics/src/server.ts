import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { prisma } from "@vpnvpn/db";

let cachedServer: FastifyInstance | null = null;

// Schema for vpn-server metrics ingestion
const vpnMetricSchema = z.object({
  serverId: z.string(),
  timestamp: z.string().datetime().optional(),
  cpu: z.number().optional(),
  memory: z.number().optional(),
  activePeers: z.number().optional(),
  region: z.string().optional(),
});

export async function buildServer(): Promise<FastifyInstance> {
  if (cachedServer) {
    return cachedServer;
  }

  const fastify = Fastify({ logger: true });

  await fastify.register(cors, {
    origin: true,
  });

  // Enhanced healthcheck with database connectivity verification
  fastify.get("/health", async (_req, reply) => {
    const checks: Record<
      string,
      { status: "ok" | "error"; latencyMs?: number; error?: string }
    > = {};

    // Database connectivity check
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
    } catch (err) {
      checks.database = {
        status: "error",
        latencyMs: Date.now() - dbStart,
        error: err instanceof Error ? err.message : "Unknown database error",
      };
    }

    // Determine overall status
    const hasError = Object.values(checks).some((c) => c.status === "error");
    const overallStatus = hasError ? "unhealthy" : "healthy";

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: "metrics",
      checks,
    };

    return reply.code(hasError ? 503 : 200).send(response);
  });

  fastify.post("/metrics/vpn", async (req, reply) => {
    try {
      const metric = vpnMetricSchema.parse(req.body);

      await prisma.vpnMetric.create({
        data: {
          serverId: metric.serverId,
          timestamp: metric.timestamp ? new Date(metric.timestamp) : new Date(),
          cpu: metric.cpu,
          memory: metric.memory,
          activePeers: metric.activePeers,
          region: metric.region,
        },
      });

      req.log.info({ metric }, "vpn metric ingested");
      return reply.code(202).send({ status: "accepted" });
    } catch (err: unknown) {
      const error = err as Error;
      req.log.error({ err }, "vpn metric ingestion failed");
      return reply.code(400).send({ error: error.message ?? "Bad Request" });
    }
  });

  cachedServer = fastify;
  return fastify;
}

export { prisma };
