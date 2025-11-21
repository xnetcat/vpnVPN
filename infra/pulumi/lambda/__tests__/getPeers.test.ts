import { describe, it, expect } from "vitest";
import { handler } from "../getPeers";

describe("getPeers Lambda", () => {
  it("should return response with peers array", async () => {
    const result = await handler({});

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty("peers");
    expect(Array.isArray(body.peers)).toBe(true);
  });

  it("should have correct response structure", async () => {
    const result = await handler({});

    expect(result).toHaveProperty("statusCode");
    expect(result).toHaveProperty("body");
    expect(typeof result.body).toBe("string");
  });
});
