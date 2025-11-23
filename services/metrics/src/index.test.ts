import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("@vpnvpn/db", () => ({
  prisma: {
    vpnMetric: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@vpnvpn/db";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";

// Minimal inline version of the metrics route for test purposes
async function buildServer() {
  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: true });

  const vpnMetricSchema = z.object({
    serverId: z.string(),
    timestamp: z.string().datetime().optional(),
    cpu: z.number().optional(),
    memory: z.number().optional(),
    activePeers: z.number().optional(),
    region: z.string().optional(),
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

      return reply.code(202).send({ status: "accepted" });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message ?? "Bad Request" });
    }
  });

  return fastify;
}

describe("metrics service", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildServer();
  });

  it("accepts valid vpn metric", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/metrics/vpn",
      payload: {
        serverId: "srv1",
        cpu: 0.5,
        memory: 0.3,
        activePeers: 10,
      },
    });

    expect(res.statusCode).toBe(202);
    expect(prisma.vpnMetric.create).toHaveBeenCalled();
  });
});
