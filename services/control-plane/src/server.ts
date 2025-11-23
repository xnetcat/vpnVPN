import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { prisma } from "@vpnvpn/db";

const apiKey = process.env.CONTROL_PLANE_API_KEY;

function requireApiKey(headers: Record<string, any>) {
  if (!apiKey) {
    throw new Error("CONTROL_PLANE_API_KEY not configured");
  }
  const headerKey = headers["x-api-key"] ?? headers["X-API-Key"];
  if (headerKey !== apiKey) {
    const err: any = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

const addPeerSchema = z.object({
  publicKey: z.string(),
  userId: z.string(),
  allowedIps: z.array(z.string()),
  serverId: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
});

const revokeForUserSchema = z.object({
  userId: z.string(),
});

export async function buildServer() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, {
    origin: true,
  });

  // Basic healthcheck
  fastify.get("/health", async () => {
    return { status: "ok" };
  });

  // Peer endpoints backed by Postgres via Prisma
  fastify.post("/peers", async (req, reply) => {
    try {
      requireApiKey(req.headers as any);
      const body = addPeerSchema.parse(req.body);

      // Mark existing active peers for this user as revoked
      await prisma.vpnPeer.updateMany({
        where: { userId: body.userId, active: true },
        data: { active: false, revokedAt: new Date() },
      });

      await prisma.vpnPeer.create({
        data: {
          publicKey: body.publicKey,
          userId: body.userId,
          allowedIps: body.allowedIps,
          serverId: body.serverId,
          country: body.country,
          region: body.region,
          active: true,
        },
      });

      req.log.info(
        { userId: body.userId, serverId: body.serverId },
        "addPeer persisted",
      );

      return reply.code(204).send();
    } catch (err: any) {
      req.log.error({ err }, "addPeer failed");
      const status = err.statusCode ?? 400;
      return reply.code(status).send({ error: err.message ?? "Bad Request" });
    }
  });

  fastify.post("/peers/revoke-for-user", async (req, reply) => {
    try {
      requireApiKey(req.headers as any);
      const body = revokeForUserSchema.parse(req.body);

      await prisma.vpnPeer.updateMany({
        where: { userId: body.userId, active: true },
        data: { active: false, revokedAt: new Date() },
      });

      req.log.info({ userId: body.userId }, "revokePeersForUser persisted");
      return reply.code(204).send();
    } catch (err: any) {
      req.log.error({ err }, "revokePeersForUser failed");
      const status = err.statusCode ?? 400;
      return reply.code(status).send({ error: err.message ?? "Bad Request" });
    }
  });

  fastify.delete("/peers/:publicKey", async (req, reply) => {
    try {
      requireApiKey(req.headers as any);
      const { publicKey } = req.params as { publicKey: string };

      await prisma.vpnPeer.update({
        where: { publicKey },
        data: { active: false, revokedAt: new Date() },
      });

      req.log.info({ publicKey }, "revokePeerByPublicKey persisted");
      return reply.code(204).send();
    } catch (err: any) {
      req.log.error({ err }, "revokePeerByPublicKey failed");
      const status = err.statusCode ?? 400;
      return reply.code(status).send({ error: err.message ?? "Bad Request" });
    }
  });

  return fastify;
}


