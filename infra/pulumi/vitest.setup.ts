import { vi } from "vitest";

// Mock Pulumi runtime for unit tests
vi.mock("@pulumi/pulumi", async () => {
  const actual = await vi.importActual("@pulumi/pulumi");
  return {
    ...actual,
    // Mock output for testing
    output: <T>(val: T) => ({
      apply: <U>(fn: (v: T) => U) => ({ apply: (f: (v: U) => unknown) => f(fn(val)) }),
      get: () => val,
    }),
    interpolate: (strings: TemplateStringsArray, ...values: unknown[]) => {
      return {
        apply: (fn: (v: string) => unknown) =>
          fn(strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "")),
      };
    },
    getStack: () => "test",
    Config: class MockConfig {
      private data: Record<string, string> = {};
      get(key: string) {
        return this.data[key];
      }
      require(key: string) {
        const val = this.data[key];
        if (!val) throw new Error(`Missing required config: ${key}`);
        return val;
      }
      getNumber(key: string) {
        const val = this.data[key];
        return val ? Number(val) : undefined;
      }
      getSecret(key: string) {
        return this.data[key];
      }
      requireSecret(key: string) {
        return this.require(key);
      }
    },
  };
});

// Test environment
process.env.NODE_ENV = "test";
