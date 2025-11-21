import { describe, it, expect } from "vitest";
import { handler } from "../registerServer";

describe("registerServer Lambda", () => {

  it("should reject missing id or token", async () => {
    const event = {
      body: JSON.stringify({ id: "server123" }),
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});

