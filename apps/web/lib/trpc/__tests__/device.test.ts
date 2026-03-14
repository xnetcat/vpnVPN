import { describe, it, expect, vi, beforeEach } from "vitest";
import { createContext } from "../init";
import { appRouter } from "../routers/_app";
import type { Session } from "next-auth";

// Mock dependencies
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/controlPlane", () => ({
  addPeerForDevice: vi.fn(),
  revokePeerByPublicKey: vi.fn(),
  revokePeersForUser: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Device Router", () => {
  const mockSession: Session = {
    user: { id: "user123", email: "test@test.com", name: "Test User" } as any,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
    },
    device: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    vpnServer: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("device.list", () => {
    it("should return user devices", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockSession);

      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: "sub123",
        userId: "user123",
        tier: "pro",
        status: "active",
      });

      mockPrisma.device.findMany.mockResolvedValue([
        {
          id: "device1",
          userId: "user123",
          name: "Test Device",
          publicKey: "test-key",
          serverId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockSession;

      const caller = appRouter.createCaller(ctx);
      const result = await caller.device.list();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test Device");
    });

    it("should require authentication", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(null);

      const ctx = await createContext();
      ctx.session = null;

      const caller = appRouter.createCaller(ctx);
      await expect(caller.device.list()).rejects.toThrow("UNAUTHORIZED");
    });
  });

  describe("device.register", () => {
    it("should register a new device", async () => {
      const { getSession } = await import("@/lib/auth");
      const { addPeerForDevice, revokePeersForUser } = await import(
        "@/lib/controlPlane"
      );

      vi.mocked(getSession).mockResolvedValue(mockSession);
      vi.mocked(addPeerForDevice).mockResolvedValue();

      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: "sub123",
        userId: "user123",
        tier: "pro",
        status: "active",
      });

      mockPrisma.vpnServer.findUnique.mockResolvedValue({
        id: "server1",
        publicKey: "c2VydmVyLXB1YmxpYy1rZXktYmFzZTY0LWVuY29kZWQ=",
        publicIp: "1.2.3.4",
        metadata: { listenPort: 51820 },
      });

      mockPrisma.device.count.mockResolvedValue(2); // Under pro limit of 5
      mockPrisma.device.findMany.mockResolvedValue([]); // No old pending devices
      mockPrisma.device.create.mockResolvedValue({
        id: "device123",
        userId: "user123",
        name: "New Device",
        publicKey: "new-key",
        serverId: "server1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user123",
        email: "test@test.com",
        name: "Test User",
      });

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockSession;

      const caller = appRouter.createCaller(ctx);
      const result = await caller.device.register({
        name: "New Device",
        serverId: "server1",
      });

      expect(result.deviceId).toBe("device123");
      expect(result.assignedIp).toBeDefined();
      expect(result.wireguardConfig).toBeDefined();
      expect(result.openvpnConfig).toBeDefined();
      expect(addPeerForDevice).toHaveBeenCalled();
      expect(revokePeersForUser).toHaveBeenCalledWith("user123");
    });

    it("should enforce device limits", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockSession);

      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: "sub123",
        userId: "user123",
        tier: "basic",
        status: "active",
      });

      mockPrisma.vpnServer.findUnique.mockResolvedValue({
        id: "server1",
        publicKey: "c2VydmVyLXB1YmxpYy1rZXktYmFzZTY0LWVuY29kZWQ=",
        publicIp: "1.2.3.4",
        metadata: { listenPort: 51820 },
      });

      mockPrisma.device.count.mockResolvedValue(1); // At basic limit of 1

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockSession;

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.device.register({
          name: "New Device",
          serverId: "server1",
        }),
      ).rejects.toThrow("Device limit reached");
    });
  });

  describe("device.revoke", () => {
    it("should revoke a device", async () => {
      const { getSession } = await import("@/lib/auth");
      const { revokePeerByPublicKey } = await import("@/lib/controlPlane");

      vi.mocked(getSession).mockResolvedValue(mockSession);
      vi.mocked(revokePeerByPublicKey).mockResolvedValue();

      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: "sub123",
        userId: "user123",
        tier: "pro",
        status: "active",
      });

      mockPrisma.device.findUnique.mockResolvedValue({
        id: "device123",
        userId: "user123",
        name: "Test Device",
        publicKey: "test-key",
        serverId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.device.delete.mockResolvedValue({
        id: "device123",
        userId: "user123",
        name: "Test Device",
        publicKey: "test-key",
        serverId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user123",
        email: "test@test.com",
        name: "Test User",
      });

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockSession;

      const caller = appRouter.createCaller(ctx);
      const result = await caller.device.revoke({ deviceId: "device123" });

      expect(result.success).toBe(true);
      expect(revokePeerByPublicKey).toHaveBeenCalledWith("test-key");
      expect(mockPrisma.device.delete).toHaveBeenCalled();
    });

    it("should not allow revoking another user's device", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockSession);

      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: "sub123",
        userId: "user123",
        tier: "pro",
        status: "active",
      });

      mockPrisma.device.findUnique.mockResolvedValue({
        id: "device123",
        userId: "other-user",
        name: "Other Device",
        publicKey: "test-key",
        serverId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockSession;

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.device.revoke({ deviceId: "device123" }),
      ).rejects.toThrow("Unauthorized");
    });
  });
});
