import { vi, beforeEach } from "vitest";

// Set test environment variables
process.env.CONTROL_PLANE_API_URL = "https://api.test.com";
process.env.CONTROL_PLANE_API_KEY = "test-api-key";
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.STRIPE_SECRET_KEY = "sk_test_123";

// Mock Prisma Client
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    device: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock Stripe
vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: {
      create: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

// Mock Next.js server functions
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
}));
