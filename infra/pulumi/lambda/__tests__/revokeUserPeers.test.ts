import { describe, it, expect } from "vitest";
import { handler } from "../revokeUserPeers";

describe("revokeUserPeers Lambda", () => {

  it("should revoke all user peers", async () => {
    const event = {
      headers: { "x-api-key": "test-web-api-key" },
      body: JSON.stringify({ userId: "user123" }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
  });

  it("should reject invalid API key", async () => {
    const event = {
      headers: { "x-api-key": "wrong-key" },
      body: JSON.stringify({ userId: "user123" }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
  });

  it("should handle missing userId", async () => {
    const event = {
      headers: { "x-api-key": "test-web-api-key" },
      body: JSON.stringify({}),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});

