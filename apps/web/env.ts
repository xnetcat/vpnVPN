function loadEnv() {
  const required = [
    // Public (exposed) config
    "NEXT_PUBLIC_WG_ENDPOINT",
    "NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY",
    "NEXT_PUBLIC_OVPN_REMOTE",
    "NEXT_PUBLIC_OVPN_PORT",
    "NEXT_PUBLIC_IKEV2_REMOTE",
    "NEXT_PUBLIC_API_URL",
    // Control plane
    "CONTROL_PLANE_API_URL",
    "CONTROL_PLANE_API_KEY",
    "CONTROL_PLANE_URL",
    // OpenVPN trust (server-side)
    "OPENVPN_PEER_FINGERPRINT",
    "OPENVPN_CA_BUNDLE",
    // Desktop downloads
    "DESKTOP_BUCKET_URL",
    "ENVIRONMENT",
    // Auth / NextAuth
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "EMAIL_FROM",
    "RESEND_API_KEY",
    "EMAIL_SERVER",
    // OAuth
    "GITHUB_ID",
    "GITHUB_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    // Stripe
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID_BASIC",
    "STRIPE_PRICE_ID_PRO",
    "STRIPE_PRICE_ID_ENTERPRISE",
    // Node admin
    "VPN_NODE_ADMIN_URL",
  ];

  const missing: string[] = [];
  const values: Record<string, string> = {};

  for (const key of required) {
    const val = process.env[key];
    if (!val || !val.trim()) {
      missing.push(key);
    } else {
      values[key] = val.trim();
    }
  }

  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error("[env] Missing required environment variables:", missing);
    throw new Error(
      `Missing required env vars (${missing.length}): ${missing.join(", ")}`
    );
  }

  return {
    // Public (exposed) config
    NEXT_PUBLIC_WG_ENDPOINT: values.NEXT_PUBLIC_WG_ENDPOINT,
    NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY: values.NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY,
    NEXT_PUBLIC_API_URL: values.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_OVPN_REMOTE: values.NEXT_PUBLIC_OVPN_REMOTE,
    NEXT_PUBLIC_OVPN_PORT: values.NEXT_PUBLIC_OVPN_PORT,
    NEXT_PUBLIC_IKEV2_REMOTE: values.NEXT_PUBLIC_IKEV2_REMOTE,

    // Control plane
    CONTROL_PLANE_API_URL: values.CONTROL_PLANE_API_URL,
    CONTROL_PLANE_API_KEY: values.CONTROL_PLANE_API_KEY,
    CONTROL_PLANE_URL: values.CONTROL_PLANE_URL,

    // OpenVPN trust (server-side)
    OPENVPN_PEER_FINGERPRINT: values.OPENVPN_PEER_FINGERPRINT,
    OPENVPN_CA_BUNDLE: values.OPENVPN_CA_BUNDLE,

    // Desktop download bucket / env
    DESKTOP_BUCKET_URL: values.DESKTOP_BUCKET_URL,
    ENVIRONMENT: values.ENVIRONMENT,

    // Auth / NextAuth
    NEXTAUTH_URL: values.NEXTAUTH_URL,
    NEXTAUTH_SECRET: values.NEXTAUTH_SECRET,
    EMAIL_SERVER: values.EMAIL_SERVER,
    EMAIL_FROM: values.EMAIL_FROM,
    RESEND_API_KEY: values.RESEND_API_KEY,

    // OAuth providers
    GITHUB_ID: values.GITHUB_ID,
    GITHUB_SECRET: values.GITHUB_SECRET,
    GOOGLE_CLIENT_ID: values.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: values.GOOGLE_CLIENT_SECRET,

    // Stripe
    STRIPE_SECRET_KEY: values.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: values.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_ID_BASIC: values.STRIPE_PRICE_ID_BASIC,
    STRIPE_PRICE_ID_PRO: values.STRIPE_PRICE_ID_PRO,
    STRIPE_PRICE_ID_ENTERPRISE: values.STRIPE_PRICE_ID_ENTERPRISE,

    // Node admin API
    VPN_NODE_ADMIN_URL: values.VPN_NODE_ADMIN_URL,
  };
}

export const WEB_ENV = loadEnv();
