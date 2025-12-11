import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { prisma } from "@vpnvpn/db";

function requireApiKey(headers: Record<string, unknown>) {
  const apiKey = process.env.CONTROL_PLANE_API_KEY;
  if (!apiKey) {
    throw new Error("CONTROL_PLANE_API_KEY not configured");
  }
  const headerKey =
    (headers["x-api-key"] as string) ?? (headers["X-API-Key"] as string);
  if (headerKey !== apiKey) {
    const err: Error & { statusCode?: number } = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

let cachedServer: FastifyInstance | null = null;

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

async function ensureBootstrapToken() {
  const token = process.env.CONTROL_PLANE_BOOTSTRAP_TOKEN;
  if (!token) {
    console.log("[control-plane] no bootstrap token configured");
    return;
  }

  console.log("[control-plane] ensuring bootstrap token...");
  try {
    await prisma.vpnToken.upsert({
      where: { token },
      update: { active: true },
      create: {
        token,
        label: "local-bootstrap",
        active: true,
      },
    });
    console.log("[control-plane] bootstrap token ensured");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[control-plane] failed to ensure bootstrap token", err);
  }
}

const registerServerSchema = z.object({
  id: z.string(),
  publicKey: z.string(),
  listenPort: z.number(),
  metadata: z.unknown().optional(),
  wgEndpoint: z.string().nullable().optional(),
  wgPort: z.number().nullable().optional(),
  ovpnEndpoint: z.string().nullable().optional(),
  ovpnPort: z.number().nullable().optional(),
  ovpnCaBundle: z.string().nullable().optional(),
  ovpnPeerFingerprint: z.string().nullable().optional(),
  ikev2Remote: z.string().nullable().optional(),
});

export async function buildServer(): Promise<FastifyInstance> {
  if (cachedServer) {
    return cachedServer;
  }

  const fastify = Fastify({ logger: true });

  console.log("[control-plane] starting server build...");

  await ensureBootstrapToken();

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
      service: "control-plane",
      checks,
    };

    return reply.code(hasError ? 503 : 200).send(response);
  });

  // ----- Server registration & listing -----
  fastify.post("/server/register", async (req, reply) => {
    try {
      const auth = req.headers.authorization as string | undefined;
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
      let metadata = (body.metadata as Record<string, unknown>) || {};
      // Persist listenPort alongside any provided metadata
      metadata = { listenPort: body.listenPort, ...metadata };

      const publicIp = metadata.publicIp as string | undefined;

      const server = await prisma.vpnServer.upsert({
        where: { id: body.id },
        update: {
          status: "online",
          lastSeen: now,
          publicIp: publicIp || undefined,
          publicKey: body.publicKey,
          metadata: body.metadata as object,
          wgEndpoint: body.wgEndpoint ?? undefined,
          wgPort: body.wgPort ?? undefined,
          ovpnEndpoint: body.ovpnEndpoint ?? undefined,
          ovpnPort: body.ovpnPort ?? undefined,
          ovpnCaBundle: body.ovpnCaBundle ?? undefined,
          ovpnPeerFingerprint: body.ovpnPeerFingerprint ?? undefined,
          ikev2Remote: body.ikev2Remote ?? undefined,
        },
        create: {
          id: body.id,
          status: "online",
          lastSeen: now,
          publicIp: publicIp || undefined,
          publicKey: body.publicKey,
          metadata: body.metadata as object,
          wgEndpoint: body.wgEndpoint ?? undefined,
          wgPort: body.wgPort ?? undefined,
          ovpnEndpoint: body.ovpnEndpoint ?? undefined,
          ovpnPort: body.ovpnPort ?? undefined,
          ovpnCaBundle: body.ovpnCaBundle ?? undefined,
          ovpnPeerFingerprint: body.ovpnPeerFingerprint ?? undefined,
          ikev2Remote: body.ikev2Remote ?? undefined,
        },
      });

      req.log.info({ id: server.id }, "server_registered");
      return reply.code(200).send({ status: "registered" });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      req.log.error({ err }, "registerServer failed");
      const status = error.statusCode ?? 400;
      return reply.code(status).send({ error: error.message ?? "Bad Request" });
    }
  });

  // Fetch peers for vpn-server nodes.
  // In a multi-node setup, we return peers for the requesting server plus any
  // unpinned peers (serverId null). The server identity is provided via the
  // `id` query param and authenticated by the bearer token.
  fastify.get("/server/peers", async (req, reply) => {
    try {
      const auth = req.headers.authorization as string | undefined;
      if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
        return reply.code(401).send({ error: "Missing bearer token" });
      }
      const token = auth.slice(7).trim();

      const vpnToken = await prisma.vpnToken.findUnique({
        where: { token },
      });
      if (!vpnToken || !vpnToken.active) {
        return reply.code(401).send({ error: "Invalid or revoked token" });
      }

      const query = (req.query || {}) as { id?: string };
      const serverId = query.id;

      const peers = await prisma.vpnPeer.findMany({
        where: serverId
          ? {
              active: true,
              OR: [{ serverId }, { serverId: null }],
            }
          : { active: true },
        orderBy: { createdAt: "asc" },
      });

      // Shape into the snake_case PeerSpec expected by vpn-server.
      const payload = {
        peers: peers.map((p) => ({
          public_key: p.publicKey,
          preshared_key: null as string | null,
          allowed_ips: p.allowedIps,
          endpoint: null as string | null,
        })),
      };

      req.log.info(
        { count: payload.peers.length, serverId: serverId ?? null },
        "server_peers_listed"
      );
      return reply.code(200).send(payload);
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      req.log.error({ err }, "listServerPeers failed");
      const status = error.statusCode ?? 500;
      return reply
        .code(status)
        .send({ error: error.message ?? "Internal Error" });
    }
  });

  fastify.get("/servers", async (req, reply) => {
    try {
      requireApiKey(req.headers as Record<string, unknown>);
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

        const metadata = (s.metadata as Record<string, unknown>) || {};
        const metric = (s.metrics && s.metrics[0]) || null;

        return {
          id: s.id,
          publicIp: s.publicIp,
          publicKey: s.publicKey,
          metadata,
          wgEndpoint: s.wgEndpoint,
          wgPort: s.wgPort,
          ovpnEndpoint: s.ovpnEndpoint,
          ovpnPort: s.ovpnPort,
          ovpnCaBundle: s.ovpnCaBundle,
          ovpnPeerFingerprint: s.ovpnPeerFingerprint,
          ikev2Remote: s.ikev2Remote,
          metrics: metric
            ? {
                sessions: metric.activePeers ?? 0,
                cpu: metric.cpu,
                memory: metric.memory,
              }
            : {},
          status,
          lastSeen,
          country: (metadata.country as string) ?? metric?.region,
          region: (metadata.region as string) ?? metric?.region,
        };
      });

      req.log.info({ count: mapped.length }, "list_servers");
      return reply.code(200).send(mapped);
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      req.log.error({ err }, "listServers failed");
      const status = error.statusCode ?? 500;
      return reply
        .code(status)
        .send({ error: error.message ?? "Internal Error" });
    }
  });

  fastify.delete("/servers/:id", async (req, reply) => {
    try {
      requireApiKey(req.headers as Record<string, unknown>);
      const { id } = req.params as { id?: string };

      if (!id) {
        return reply.code(400).send({ error: "Server id required" });
      }

      const server = await prisma.vpnServer.findUnique({ where: { id } });
      if (!server) {
        return reply.code(404).send({ error: "Server not found" });
      }

      await prisma.vpnPeer.updateMany({
        where: { serverId: id },
        data: { serverId: null },
      });

      await prisma.vpnServer.delete({ where: { id } });

      req.log.info({ id }, "delete_server");
      return reply.code(204).send();
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      req.log.error({ err }, "deleteServer failed");
      const status = error.statusCode ?? 500;
      return reply
        .code(status)
        .send({ error: error.message ?? "Internal Error" });
    }
  });

  // ----- Peer endpoints backed by Postgres via Prisma -----
  fastify.post("/peers", async (req, reply) => {
    try {
      requireApiKey(req.headers as Record<string, unknown>);
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
        "addPeer persisted"
      );

      return reply.code(204).send();
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      req.log.error({ err }, "addPeer failed");
      const status = error.statusCode ?? 400;
      return reply.code(status).send({ error: error.message ?? "Bad Request" });
    }
  });

  fastify.post("/peers/revoke-for-user", async (req, reply) => {
    try {
      requireApiKey(req.headers as Record<string, unknown>);
      const body = revokeForUserSchema.parse(req.body);

      await prisma.vpnPeer.updateMany({
        where: { userId: body.userId, active: true },
        data: { active: false, revokedAt: new Date() },
      });

      req.log.info({ userId: body.userId }, "revokePeersForUser persisted");
      return reply.code(204).send();
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      req.log.error({ err }, "revokePeersForUser failed");
      const status = error.statusCode ?? 400;
      return reply.code(status).send({ error: error.message ?? "Bad Request" });
    }
  });

  fastify.delete("/peers/:publicKey", async (req, reply) => {
    try {
      requireApiKey(req.headers as Record<string, unknown>);
      const { publicKey } = req.params as { publicKey: string };

      await prisma.vpnPeer.update({
        where: { publicKey },
        data: { active: false, revokedAt: new Date() },
      });

      req.log.info({ publicKey }, "revokePeerByPublicKey persisted");
      return reply.code(204).send();
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      req.log.error({ err }, "revokePeerByPublicKey failed");
      const status = error.statusCode ?? 400;
      return reply.code(status).send({ error: error.message ?? "Bad Request" });
    }
  });

  // ----- Admin: Token Management -----
  const classifyToken = (label: string | null | undefined) => {
    const normalized = (label || "").toLowerCase();
    if (normalized.includes("bootstrap") || normalized.startsWith("system")) {
      return "system";
    }
    return "user";
  };

  fastify.get("/tokens", async (req, reply) => {
    try {
      requireApiKey(req.headers as Record<string, unknown>);

      const tokens = await prisma.vpnToken.findMany({
        orderBy: { createdAt: "desc" },
      });

      return reply.code(200).send(
        tokens.map((token) => ({
          ...token,
          scope: classifyToken(token.label),
        }))
      );
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      req.log.error({ err }, "listTokens failed");
      const status = error.statusCode ?? 400;
      return reply.code(status).send({ error: error.message ?? "Bad Request" });
    }
  });

  const createTokenHandler = async (req: any, reply: any) => {
    try {
      requireApiKey(req.headers as Record<string, unknown>);
      const body = z.object({ label: z.string() }).parse(req.body);

      // Generate a secure random token
      const token = require("crypto").randomBytes(32).toString("hex");

      const vpnToken = await prisma.vpnToken.create({
        data: {
          token,
          label: body.label,
          active: true,
        },
      });

      req.log.info({ label: body.label }, "admin_token_created");
      return reply.code(201).send({
        ...vpnToken,
        scope: classifyToken(vpnToken.label),
      });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      req.log.error({ err }, "createToken failed");
      const status = error.statusCode ?? 400;
      return reply.code(status).send({ error: error.message ?? "Bad Request" });
    }
  };

  fastify.post("/tokens", createTokenHandler);
  fastify.post("/admin/tokens", createTokenHandler);

  const revokeTokenHandler = async (req: any, reply: any) => {
    try {
      requireApiKey(req.headers as Record<string, unknown>);
      const { token } = req.params as { token: string };

      const existing = await prisma.vpnToken.findUnique({
        where: { token },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Token not found" });
      }

      const revoked = await prisma.vpnToken.update({
        where: { token },
        data: { active: false },
      });

      req.log.info({ token }, "admin_token_revoked");
      return reply.code(200).send({
        ...revoked,
        scope: classifyToken(revoked.label),
      });
    } catch (err: unknown) {
      const error = err as Error & { statusCode?: number };
      req.log.error({ err }, "revokeToken failed");
      const status = error.statusCode ?? 400;
      return reply.code(status).send({ error: error.message ?? "Bad Request" });
    }
  };

  fastify.delete("/tokens/:token", revokeTokenHandler);
  fastify.delete("/admin/tokens/:token", revokeTokenHandler);

  cachedServer = fastify;
  return fastify;
}

export { prisma };
