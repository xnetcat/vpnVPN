function loadEnv() {
  const required = ["VITE_API_BASE_URL", "VITE_APP_CHANNEL"];

  const missing: string[] = [];
  const values: Record<string, string> = {};

  for (const key of required) {
    const val = (import.meta.env as any)?.[key];
    if (typeof val !== "string" || !val.trim()) {
      missing.push(key);
    } else {
      values[key] = val.trim();
    }
  }

  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(
      "[desktop env] Missing required environment variables:",
      missing,
    );
    throw new Error(
      `Missing required desktop env vars (${missing.length}): ${missing.join(", ")}`,
    );
  }

  return {
    API_BASE_URL: values.VITE_API_BASE_URL,
    APP_CHANNEL: (import.meta.env as any)?.VITE_APP_CHANNEL,
  };
}

export const DESKTOP_ENV = loadEnv();
