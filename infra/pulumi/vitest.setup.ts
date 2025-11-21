import { vi } from "vitest";

// Mock AWS SDK before any imports
const mockPut = vi.fn().mockReturnValue({
  promise: vi.fn().mockResolvedValue({}),
});

const mockGet = vi.fn().mockReturnValue({
  promise: vi.fn().mockResolvedValue({}),
});

const mockScan = vi.fn().mockReturnValue({
  promise: vi.fn().mockResolvedValue({ Items: [] }),
});

const mockQuery = vi.fn().mockReturnValue({
  promise: vi.fn().mockResolvedValue({ Items: [] }),
});

const mockUpdate = vi.fn().mockReturnValue({
  promise: vi.fn().mockResolvedValue({}),
});

const mockDelete = vi.fn().mockReturnValue({
  promise: vi.fn().mockResolvedValue({}),
});

vi.mock("aws-sdk", () => ({
  DynamoDB: {
    DocumentClient: vi.fn(() => ({
      put: mockPut,
      get: mockGet,
      scan: mockScan,
      query: mockQuery,
      update: mockUpdate,
      delete: mockDelete,
    })),
  },
}));

// Test environment variables
process.env.PEERS_TABLE = "test-peers-table";
process.env.SERVERS_TABLE = "test-servers-table";
process.env.TOKENS_TABLE = "test-tokens-table";
process.env.WEB_API_KEY = "test-web-api-key";

export { mockPut, mockGet, mockScan, mockQuery, mockUpdate, mockDelete };

