import { describe, it, expect, vi, beforeEach } from "vitest";
import { createContext } from "../init";
import { appRouter } from "../routers/_app";
import type { Session } from "next-auth";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

describe("Admin Router", () => {
  const mockAdminSession: Session = {
    user: { id: "admin123", email: "admin@test.com", name: "Admin User" },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const mockUserSession: Session = {
    user: { id: "user123", email: "user@test.com", name: "Regular User" },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONTROL_PLANE_API_URL = "https://api.test.com";
    process.env.CONTROL_PLANE_API_KEY = "test-key";
  });

  describe("admin.listServers", () => {
    it("should list servers for admin", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockAdminSession);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "admin123",
        role: "admin",
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "server1", status: "online", metrics: { sessions: 5 } },
        ],
      } as any);

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockAdminSession;

      const caller = appRouter.createCaller(ctx);
      const result = await caller.admin.listServers();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("server1");
    });

    it("should deny access for non-admin", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockUserSession);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user123",
        role: "user",
      });

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockUserSession;

      const caller = appRouter.createCaller(ctx);
      await expect(caller.admin.listServers()).rejects.toThrow(
        "Admin access required",
      );
    });
  });

  describe("admin.createToken", () => {
    it("should create a token for admin", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockAdminSession);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "admin123",
        role: "admin",
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ token: "new-token-123", label: "Test Token" }),
      } as any);

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockAdminSession;

      const caller = appRouter.createCaller(ctx);
      const result = await caller.admin.createToken({ label: "Test Token" });

      expect(result.token).toBe("new-token-123");
      expect(result.label).toBe("Test Token");
    });
  });

  describe("admin.revokeToken", () => {
    it("should revoke a token for admin", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockAdminSession);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "admin123",
        role: "admin",
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ status: "revoked", token: "token-to-revoke" }),
      } as any);

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockAdminSession;

      const caller = appRouter.createCaller(ctx);
      const result = await caller.admin.revokeToken({
        token: "token-to-revoke",
      });

      expect(result.status).toBe("revoked");
    });
  });

  describe("admin.deleteServer", () => {
    it("should delete a server for admin", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockAdminSession);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "admin123",
        role: "admin",
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => "",
      } as any);

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockAdminSession;

      const caller = appRouter.createCaller(ctx);
      const result = await caller.admin.deleteServer({ id: "server-1" });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.test.com/servers/server-1",
        {
          method: "DELETE",
          headers: { "x-api-key": "test-key" },
        },
      );
      expect(result.status).toBe("deleted");
    });

    it("should surface not found errors", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockAdminSession);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "admin123",
        role: "admin",
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "not found",
      } as any);

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockAdminSession;

      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.admin.deleteServer({ id: "missing" }),
      ).rejects.toThrow("Server not found");
    });
  });
});
