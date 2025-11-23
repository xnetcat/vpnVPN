import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("@vpnvpn/db", () => ({
  prisma: {
    vpnPeer: {
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { buildServer } from "./server";
import { prisma } from "@vpnvpn/db";

describe("control-plane service", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.CONTROL_PLANE_API_KEY = "test-key";
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

    expect(res.statusCode).toBe(400);
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
});


