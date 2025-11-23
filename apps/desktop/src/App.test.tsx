import { describe, it, expect } from "vitest";
import { WEB_URL } from "./App";

describe("desktop App config", () => {
  it("exposes a sensible default desktop URL", () => {
    expect(WEB_URL).toMatch(/^https?:\/\//);
  });
});

