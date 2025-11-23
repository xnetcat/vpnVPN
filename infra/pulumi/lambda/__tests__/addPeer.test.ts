import { describe, it, expect, beforeEach } from "vitest";
import { handler } from "../addPeer";
import { mockQuery, mockUpdate } from "../../vitest.setup";

describe("addPeer Lambda", () => {
  beforeEach(async () => {
    const { vi } = await import("vitest");
    vi.clearAllMocks();
  });

  it("should add peer with valid API key", async () => {
    const event = {
      headers: { "x-api-key": "test-web-api-key" },
      body: JSON.stringify({
        publicKey: "test-key",
        userId: "user123",
        allowedIps: ["10.8.0.10/32"],
      }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe("peer_added");
    expect(mockQuery).toHaveBeenCalled();
    // No existing peers by default in the mock, so no updates performed.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("should reject invalid API key", async () => {
    const event = {
      headers: { "x-api-key": "wrong-key" },
      body: JSON.stringify({
        publicKey: "test-key",
        userId: "user123",
      }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
  });

  it("should reject missing publicKey", async () => {
    const event = {
      headers: { "x-api-key": "test-web-api-key" },
      body: JSON.stringify({
        userId: "user123",
      }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});
