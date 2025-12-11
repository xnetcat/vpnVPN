import { vi, beforeEach } from "vitest";

// Set test environment variables
process.env.CONTROL_PLANE_API_URL = "https://api.test.com";
process.env.CONTROL_PLANE_API_KEY = "test-api-key";
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.NEXTAUTH_SECRET = "nextauth_secret_test";
process.env.STRIPE_SECRET_KEY = "sk_test_123";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.STRIPE_PRICE_ID_BASIC = "price_basic_test";
process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
process.env.STRIPE_PRICE_ID_ENTERPRISE = "price_enterprise_test";
process.env.NEXT_PUBLIC_WG_ENDPOINT = "wg.test:51820";
process.env.NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY = "WG_PUB_TEST";
process.env.OPENVPN_PEER_FINGERPRINT = "FP_TEST";
process.env.OPENVPN_CA_BUNDLE =
  "-----BEGIN CERT-----\nTEST\n-----END CERT-----";
process.env.NEXT_PUBLIC_API_URL = "https://api.test.com";
process.env.NEXT_PUBLIC_OVPN_REMOTE = "ovpn.test.com";
process.env.NEXT_PUBLIC_OVPN_PORT = "1194";
process.env.NEXT_PUBLIC_IKEV2_REMOTE = "ikev2.test.com";
process.env.DESKTOP_BUCKET_URL = "https://bucket.test";
process.env.ENVIRONMENT = "staging";
process.env.EMAIL_FROM = "test@vpnvpn.dev";
process.env.RESEND_API_KEY = "re_test_123";
process.env.GITHUB_ID = "gh_id_test";
process.env.GITHUB_SECRET = "gh_secret_test";
process.env.GOOGLE_CLIENT_ID = "google_id_test";
process.env.GOOGLE_CLIENT_SECRET = "google_secret_test";
process.env.VPN_NODE_ADMIN_URL = "http://vpn-node:9090";

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
