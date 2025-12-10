// API configuration - set via environment variables at build time
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export const DASHBOARD_URL =
  import.meta.env.VITE_DASHBOARD_URL ?? `${API_BASE_URL}/dashboard`;

// WireGuard configuration
export const WG_ENDPOINT = import.meta.env.VITE_WG_ENDPOINT ?? "";
export const WG_SERVER_PUBLIC_KEY =
  import.meta.env.VITE_WG_SERVER_PUBLIC_KEY ?? "";

// Log configuration on load (for debugging)
console.log("[config] Environment loaded:");
console.log("[config]   API_BASE_URL:", API_BASE_URL);
console.log("[config]   WG_ENDPOINT:", WG_ENDPOINT || "(empty)");
console.log(
  "[config]   WG_SERVER_PUBLIC_KEY:",
  WG_SERVER_PUBLIC_KEY ? "(set)" : "(empty)",
);

// OpenVPN configuration
export const OVPN_REMOTE = import.meta.env.VITE_OVPN_REMOTE ?? "<vpn-hostname>";
export const OVPN_PORT = import.meta.env.VITE_OVPN_PORT ?? "1194";

// IKEv2 configuration
export const IKEV2_REMOTE =
  import.meta.env.VITE_IKEV2_REMOTE ?? "<vpn-hostname>";

// Check if we're in production
export const IS_PRODUCTION = import.meta.env.PROD;

// Desktop channel (prod/staging/devel)
export const APP_CHANNEL = (
  import.meta.env.VITE_APP_CHANNEL ??
  (import.meta.env.DEV ? "devel" : "prod")
).toLowerCase();

console.log("[config]   APP_CHANNEL:", APP_CHANNEL);
