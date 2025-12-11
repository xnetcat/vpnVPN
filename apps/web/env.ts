function loadEnv() {
  const required = [
    // Control plane
    "CONTROL_PLANE_API_URL",
    "CONTROL_PLANE_API_KEY",
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
    CONTROL_PLANE_API_URL: values.CONTROL_PLANE_API_URL,
    CONTROL_PLANE_API_KEY: values.CONTROL_PLANE_API_KEY,

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
  };
}

export const WEB_ENV = loadEnv();
