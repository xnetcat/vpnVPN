import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { prisma } from "@vpnvpn/db";

function requireApiKey(headers: Record<string, any>) {
  const apiKey = process.env.CONTROL_PLANE_API_KEY;
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

const registerServerSchema = z.object({
  id: z.string(),
  publicKey: z.string(),
  listenPort: z.number(),
  metadata: z.unknown().optional(),
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

  // ----- Server registration & listing -----
  fastify.post("/server/register", async (req, reply) => {
    try {
      const auth = (req.headers.authorization ||
        // @ts-expect-error legacy casing
        (req.headers as any).Authorization) as string | undefined;
      if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
        return reply.code(401).send({ error: "Missing bearer token" });
      }
      const token = auth.slice(7).trim();

      const body = registerServerSchema.parse(req.body);

      const vpnToken = await prisma.vpnToken.findUnique({
        where: { token },
      });
      if (!vpnToken || !vpnToken.active) {
        return reply.code(401).send({ error: "Invalid or revoked token" });
      }

      await prisma.vpnToken.update({
        where: { token },
        data: { usageCount: { increment: 1 } },
      });

      const now = new Date();
      const server = await prisma.vpnServer.upsert({
        where: { id: body.id },
        update: {
          status: "online",
          lastSeen: now,
          metadata: body.metadata as any,
        },
        create: {
          id: body.id,
          status: "online",
          lastSeen: now,
          metadata: body.metadata as any,
        },
      });

      req.log.info({ id: server.id }, "server_registered");
      return reply.code(200).send({ status: "registered" });
    } catch (err: any) {
      req.log.error({ err }, "registerServer failed");
      const status = err.statusCode ?? 400;
      return reply.code(status).send({ error: err.message ?? "Bad Request" });
    }
  });

  fastify.get("/servers", async (req, reply) => {
    try {
      requireApiKey(req.headers as any);
      const now = Date.now();

      const servers = await prisma.vpnServer.findMany({
        include: {
          metrics: {
            orderBy: { timestamp: "desc" },
            take: 1,
          },
        },
      });

      const mapped = servers.map((s) => {
        const lastSeen = s.lastSeen?.toISOString();
        let status = s.status || "unknown";
        if (lastSeen) {
          const lastMs = Date.parse(lastSeen);
          if (Number.isFinite(lastMs)) {
            const diffMs = now - lastMs;
            if (diffMs > 5 * 60 * 1000) {
              status = "offline";
            } else if (!status || status === "unknown") {
              status = "online";
            }
          }
        }

        const metadata = (s.metadata as any) || {};
        const metric = (s.metrics && s.metrics[0]) || null;

        return {
          id: s.id,
          publicIp: s.publicIp,
          metadata,
          metrics: metric
            ? {
                sessions: metric.activePeers ?? 0,
                cpu: metric.cpu,
                memory: metric.memory,
              }
            : {},
          status,
          lastSeen,
          country: metadata.country ?? metric?.region,
          region: metadata.region ?? metric?.region,
        };
      });

      req.log.info({ count: mapped.length }, "list_servers");
      return reply.code(200).send(mapped);
    } catch (err: any) {
      req.log.error({ err }, "listServers failed");
      const status = err.statusCode ?? 500;
      return reply.code(status).send({ error: err.message ?? "Internal Error" });
    }
  });

  // ----- Peer endpoints backed by Postgres via Prisma -----
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
