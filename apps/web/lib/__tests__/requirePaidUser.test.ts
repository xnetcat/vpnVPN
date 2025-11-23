import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

describe("requirePaidUser", () => {
  const mockPrisma = {
    subscription: {
      findFirst: vi.fn(),
    },
    device: {
      count: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should allow paid user with active subscription", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user123" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.doMock("@/lib/prisma", () => ({
      prisma: mockPrisma,
    }));

    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: "sub123",
      userId: "user123",
      status: "active",
      tier: "pro",
    });

    const { requirePaidUser } = await import("@/lib/requirePaidUser");
    const result = await requirePaidUser();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("user123");
      expect(result.tier).toBe("pro");
      expect(result.deviceLimit).toBe(5);
    }
  });

  it("should reject unauthenticated user", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(null);

    const { requirePaidUser } = await import("@/lib/requirePaidUser");
    const result = await requirePaidUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unauthenticated");
    }
  });

  it("should reject user without subscription", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user123" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.doMock("@/lib/prisma", () => ({
      prisma: mockPrisma,
    }));

    mockPrisma.subscription.findFirst.mockResolvedValue(null);

    const { requirePaidUser } = await import("@/lib/requirePaidUser");
    const result = await requirePaidUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("payment_required");
    }
  });

  it("should check device limit", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "user123" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    } as any);

    vi.doMock("@/lib/prisma", () => ({
      prisma: mockPrisma,
    }));

    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: "sub123",
      userId: "user123",
      status: "active",
      tier: "basic",
    });

    mockPrisma.device.count.mockResolvedValue(1);

    const { checkDeviceLimit } = await import("@/lib/requirePaidUser");
    const result = await checkDeviceLimit("user123");

    expect(result.canAdd).toBe(false);
    expect(result.current).toBe(1);
    expect(result.limit).toBe(1);
  });
});
