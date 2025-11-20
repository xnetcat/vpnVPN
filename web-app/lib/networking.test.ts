import { describe, it, expect } from "vitest";
import { allocateDeviceIp } from "./networking";

describe("allocateDeviceIp", () => {
  it("is deterministic for a given user+device", () => {
    const ip1 = allocateDeviceIp("user-1", "device-1");
    const ip2 = allocateDeviceIp("user-1", "device-1");
    expect(ip1).toBe(ip2);
  });

  it("returns an IP in the 10.8.0.0/24 range", () => {
    const ip = allocateDeviceIp("user-2", "device-xyz");
    expect(ip.startsWith("10.8.0.")).toBe(true);
    expect(ip.endsWith("/32")).toBe(true);
  });
});


