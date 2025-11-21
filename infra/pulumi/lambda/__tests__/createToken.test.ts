import { describe, it, expect } from "vitest";
import { handler } from "../createToken";

describe("createToken Lambda", () => {

  it("should create token with valid API key", async () => {
    const event = {
      headers: { "x-api-key": "test-web-api-key" },
      body: JSON.stringify({ label: "Test Token" }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.token).toBeDefined();
    expect(body.token).toHaveLength(64); // 32 bytes hex encoded
    expect(body.label).toBe("Test Token");
  });

  it("should generate 64 character token", async () => {
    const event = {
      headers: { "x-api-key": "test-web-api-key" },
      body: JSON.stringify({ label: "Another Token" }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.token).toHaveLength(64);
  });

  it("should reject invalid API key", async () => {
    const event = {
      headers: { "x-api-key": "wrong-key" },
      body: JSON.stringify({ label: "Test" }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
  });
});

