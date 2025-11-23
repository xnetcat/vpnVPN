import { describe, it, expect, vi, beforeEach } from "vitest";
import { createContext } from "../init";
import { appRouter } from "../routers/_app";
import type { Session } from "next-auth";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

describe("Proxies Router", () => {
  const mockSession: Session = {
    user: { id: "user123", email: "test@test.com", name: "Test User" } as any,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const mockPrisma = {
    subscription: {
      findFirst: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONTROL_PLANE_API_URL = "https://api.test.com";
    process.env.CONTROL_PLANE_API_KEY = "test-key";
  });

  describe("proxies.list", () => {
    it("should list proxies for paid users sorted by latency", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockSession);

      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: "sub123",
        userId: "user123",
        tier: "pro",
        status: "active",
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [
          {
            proxyId: "p1",
            type: "http",
            ip: "1.2.3.4",
            port: 8080,
            latency: 120,
            score: 10,
            country: "US",
          },
          {
            proxyId: "p2",
            type: "http",
            ip: "5.6.7.8",
            port: 8080,
            latency: 50,
            score: 5,
            country: "DE",
          },
        ],
      } as any);

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockSession;

      const caller = appRouter.createCaller(ctx);
      const result = await caller.proxies.list();

      expect(result).toHaveLength(2);
      // Sorted by latency ascending, so the DE proxy comes first.
      expect(result[0].ip).toBe("5.6.7.8");
      expect(result[0].country).toBe("DE");
      expect(result[1].ip).toBe("1.2.3.4");
    });
  });
});
