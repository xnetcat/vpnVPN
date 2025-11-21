import { describe, it, expect, vi, beforeEach } from "vitest";
import { createContext } from "../init";
import { appRouter } from "../routers/_app";
import type { Session } from "next-auth";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

describe("Billing Router", () => {
  const mockSession: Session = {
    user: { id: "user123", email: "test@test.com", name: "Test User" },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("billing.createCheckoutSession", () => {
    it("should create a checkout session", async () => {
      const { getSession } = await import("@/lib/auth");
      const { stripe } = await import("@/lib/stripe");
      
      vi.mocked(getSession).mockResolvedValue(mockSession);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user123",
        email: "test@test.com",
        name: "Test User",
        stripeCustomerId: "cus_123",
      });

      vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
        url: "https://checkout.stripe.com/pay/cs_test_123",
      } as any);

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockSession;

      const caller = appRouter.createCaller(ctx);
      const result = await caller.billing.createCheckoutSession({
        priceId: "price_123",
      });

      expect(result.url).toBe("https://checkout.stripe.com/pay/cs_test_123");
      expect(stripe.checkout.sessions.create).toHaveBeenCalled();
    });

    it("should create Stripe customer if not exists", async () => {
      const { getSession } = await import("@/lib/auth");
      const { stripe } = await import("@/lib/stripe");
      
      vi.mocked(getSession).mockResolvedValue(mockSession);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user123",
        email: "test@test.com",
        name: "Test User",
        stripeCustomerId: null,
      });

      vi.mocked(stripe.customers.create).mockResolvedValue({
        id: "cus_new",
      } as any);

      vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
        url: "https://checkout.stripe.com/pay/cs_test_123",
      } as any);

      mockPrisma.user.update.mockResolvedValue({
        id: "user123",
        stripeCustomerId: "cus_new",
      });

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockSession;

      const caller = appRouter.createCaller(ctx);
      await caller.billing.createCheckoutSession({
        priceId: "price_123",
      });

      expect(stripe.customers.create).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });
  });

  describe("billing.createPortalSession", () => {
    it("should create a portal session", async () => {
      const { getSession } = await import("@/lib/auth");
      const { stripe } = await import("@/lib/stripe");
      
      vi.mocked(getSession).mockResolvedValue(mockSession);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user123",
        email: "test@test.com",
        name: "Test User",
        stripeCustomerId: "cus_123",
      });

      vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValue({
        url: "https://billing.stripe.com/session/portal_123",
      } as any);

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockSession;

      const caller = appRouter.createCaller(ctx);
      const result = await caller.billing.createPortalSession();

      expect(result.url).toBe("https://billing.stripe.com/session/portal_123");
    });

    it("should fail without Stripe customer", async () => {
      const { getSession } = await import("@/lib/auth");
      vi.mocked(getSession).mockResolvedValue(mockSession);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user123",
        email: "test@test.com",
        name: "Test User",
        stripeCustomerId: null,
      });

      const ctx = await createContext();
      ctx.prisma = mockPrisma as any;
      ctx.session = mockSession;

      const caller = appRouter.createCaller(ctx);
      await expect(caller.billing.createPortalSession()).rejects.toThrow(
        "No Stripe customer found"
      );
    });
  });
});

