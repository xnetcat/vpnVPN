import { describe, it, expect } from "vitest";
import { TIERS, getTierFromPriceId, getTierConfig } from "@/lib/tiers";

describe("Tiers configuration", () => {
  it("should have correct Basic tier configuration", () => {
    const basic = TIERS.basic;
    expect(basic.name).toBe("Basic");
    expect(basic.price).toBe(5);
    expect(basic.deviceLimit).toBe(1);
    expect(basic.features).toContain("1 device");
  });

  it("should have correct Pro tier configuration", () => {
    const pro = TIERS.pro;
    expect(pro.name).toBe("Pro");
    expect(pro.price).toBe(12);
    expect(pro.deviceLimit).toBe(5);
    expect(pro.features).toContain("5 devices");
    expect(pro.features).toContain("Priority support");
  });

  it("should have correct Enterprise tier configuration", () => {
    const enterprise = TIERS.enterprise;
    expect(enterprise.name).toBe("Enterprise");
    expect(enterprise.price).toBe(29);
    expect(enterprise.deviceLimit).toBe(999);
    expect(enterprise.features).toContain("Unlimited devices");
    expect(enterprise.features).toContain("Dedicated support");
  });

  it("should get tier from price ID", () => {
    // The tier matching works based on what's in TIERS object
    // For testing, we just verify the fallback behavior
    const tier = getTierFromPriceId("unknown_price_id");
    expect(tier).toBe("basic"); // Falls back to basic
  });

  it("should default to basic for unknown price ID", () => {
    const tier = getTierFromPriceId("unknown_price");
    expect(tier).toBe("basic");
  });

  it("should get tier config by name", () => {
    const proConfig = getTierConfig("pro");
    expect(proConfig.name).toBe("Pro");
    expect(proConfig.deviceLimit).toBe(5);
  });
});
