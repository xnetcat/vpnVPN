import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

const mockPrisma = vi.hoisted(() => ({
  vpnPeer: {
    updateMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  vpnToken: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  vpnServer: {
    upsert: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  vpnMetric: {
    deleteMany: vi.fn(),
  },
  $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
}));

vi.mock("@vpnvpn/db", () => ({
  prisma: mockPrisma,
}));

import { buildServer } from "./server";
import { prisma } from "@vpnvpn/db";

describe("control-plane service", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.CONTROL_PLANE_API_KEY = "test-key";
    mockPrisma.vpnServer.findUnique.mockResolvedValue({ id: "server-1" });
    mockPrisma.vpnServer.delete.mockResolvedValue({});
    app = await buildServer();
  });

  it("rejects requests without API key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/peers",
      payload: {
        publicKey: "pk",
        userId: "user1",
        allowedIps: ["10.8.0.2/32"],
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("accepts valid addPeer requests", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/peers",
      headers: { "x-api-key": "test-key" },
      payload: {
        publicKey: "pk",
        userId: "user1",
        allowedIps: ["10.8.0.2/32"],
      },
    });

    expect(res.statusCode).toBe(204);
    expect(prisma.vpnPeer.updateMany).toHaveBeenCalled();
    expect(prisma.vpnPeer.create).toHaveBeenCalled();
  });

  it("deletes a server and clears peer assignments", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/servers/server-1",
      headers: { "x-api-key": "test-key" },
    });

    expect(res.statusCode).toBe(204);
    expect(prisma.vpnPeer.updateMany).toHaveBeenCalledWith({
      where: { serverId: "server-1" },
      data: { serverId: null },
    });
    expect(prisma.vpnServer.delete).toHaveBeenCalledWith({
      where: { id: "server-1" },
    });
  });

  it("returns 404 when deleting a missing server", async () => {
    mockPrisma.vpnServer.findUnique.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "DELETE",
      url: "/servers/missing",
      headers: { "x-api-key": "test-key" },
    });

    expect(res.statusCode).toBe(404);
  });
});
