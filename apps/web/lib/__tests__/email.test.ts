import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEmailSend = vi.fn().mockResolvedValue({ id: "email-123" });

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mockEmailSend,
    },
  })),
}));

// Set test env vars
process.env.RESEND_API_KEY = "re_test_123";
process.env.EMAIL_FROM = "test@vpnvpn.dev";

describe("Email utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailSend.mockClear();
  });

  it("should send welcome email", async () => {
    const { sendEmail } = await import("@/lib/email");

    await sendEmail({
      to: "user@test.com",
      template: "welcome",
      data: {
        name: "Test User",
        dashboardUrl: "http://localhost:3000/dashboard",
      },
    });

    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Welcome to vpnVPN",
      }),
    );
  });

  it("should send subscription active email", async () => {
    const { sendEmail } = await import("@/lib/email");

    await sendEmail({
      to: "user@test.com",
      template: "subscription_active",
      data: {
        name: "Test User",
        plan: "Pro",
        deviceLimit: "5",
        nextBillingDate: "2024-12-31",
        dashboardUrl: "http://localhost:3000/dashboard",
      },
    });

    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Your vpnVPN subscription is active",
      }),
    );
  });

  it("should send subscription cancelled email", async () => {
    const { sendEmail } = await import("@/lib/email");

    await sendEmail({
      to: "user@test.com",
      template: "subscription_cancelled",
      data: {
        name: "Test User",
        pricingUrl: "http://localhost:3000/pricing",
      },
    });

    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Your vpnVPN subscription has been cancelled",
      }),
    );
  });

  it("should send device added security alert", async () => {
    const { sendEmail } = await import("@/lib/email");

    await sendEmail({
      to: "user@test.com",
      template: "device_added",
      data: {
        name: "Test User",
        deviceName: "MacBook Pro",
        dashboardUrl: "http://localhost:3000/devices",
      },
    });

    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "New device added to your vpnVPN account",
      }),
    );
  });

  it("should send device revoked security alert", async () => {
    const { sendEmail } = await import("@/lib/email");

    await sendEmail({
      to: "user@test.com",
      template: "device_revoked",
      data: {
        name: "Test User",
        deviceName: "MacBook Pro",
        dashboardUrl: "http://localhost:3000/devices",
      },
    });

    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Device removed from your vpnVPN account",
      }),
    );
  });

  it("should handle missing API key gracefully", async () => {
    process.env.RESEND_API_KEY = "";

    // Re-import to get new instance without API key
    vi.resetModules();
    const { sendEmail } = await import("@/lib/email");

    // Should not throw
    await expect(
      sendEmail({
        to: "user@test.com",
        template: "welcome",
        data: { name: "Test" },
      }),
    ).resolves.toBeUndefined();

    // Restore
    process.env.RESEND_API_KEY = "re_test_123";
  });
});
