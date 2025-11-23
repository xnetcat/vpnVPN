import { describe, it, expect, vi, beforeEach } from "vitest";
import { createContext } from "../init";
import { appRouter } from "../routers/_app";
import type { Session } from "next-auth";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

describe("Account Router", () => {
  const mockSession: Session = {
    user: { id: "user123", email: "test@test.com", name: "Test User" } as any,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const mockPrisma = {
    subscription: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    notificationPreferences: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns aggregated account data from get", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(mockSession);

    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: "sub123",
      userId: "user123",
      tier: "pro",
      status: "active",
      currentPeriodEnd: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      name: "Test User",
      email: "test@test.com",
    });

    mockPrisma.notificationPreferences.findUnique.mockResolvedValue({
      userId: "user123",
      marketing: true,
      transactional: true,
      security: true,
    });

    const ctx = await createContext();
    ctx.prisma = mockPrisma as any;
    ctx.session = mockSession;

    const caller = appRouter.createCaller(ctx);
    const result = await caller.account.get();

    expect(result.subscription?.id).toBe("sub123");
    expect(result.user?.email).toBe("test@test.com");
    expect(result.notificationPreferences?.security).toBe(true);
  });

  it("updates profile name via updateProfile", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(mockSession);

    const ctx = await createContext();
    ctx.prisma = mockPrisma as any;
    ctx.session = mockSession;

    const caller = appRouter.createCaller(ctx);
    await caller.account.updateProfile({ name: "New Name" });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user123" },
      data: { name: "New Name" },
    });
  });

  it("upserts notification preferences via updateNotifications", async () => {
    const { getSession } = await import("@/lib/auth");
    vi.mocked(getSession).mockResolvedValue(mockSession);

    const ctx = await createContext();
    ctx.prisma = mockPrisma as any;
    ctx.session = mockSession;

    const caller = appRouter.createCaller(ctx);
    await caller.account.updateNotifications({
      marketing: false,
      transactional: true,
      security: false,
    });

    expect(mockPrisma.notificationPreferences.upsert).toHaveBeenCalledWith({
      where: { userId: "user123" },
      update: {
        marketing: false,
        transactional: true,
        security: false,
      },
      create: {
        userId: "user123",
        marketing: false,
        transactional: true,
        security: false,
      },
    });
  });
});
