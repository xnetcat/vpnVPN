import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { prisma } from "@vpnvpn/db";

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: true,
});

// Simple schema for vpn-server metrics ingestion
const vpnMetricSchema = z.object({
  serverId: z.string(),
  timestamp: z.string().datetime().optional(),
  cpu: z.number().optional(),
  memory: z.number().optional(),
  activePeers: z.number().optional(),
  region: z.string().optional(),
});

fastify.get("/health", async () => {
  return { status: "ok" };
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
  } catch (err: any) {
    req.log.error({ err }, "vpn metric ingestion failed");
    return reply.code(400).send({ error: err.message ?? "Bad Request" });
  }
});

const port = Number(process.env.PORT ?? 4100);

fastify
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    fastify.log.info(`metrics service listening on ${address}`);
  })
  .catch((err) => {
    fastify.log.error(err, "failed to start metrics service");
    process.exit(1);
  });
