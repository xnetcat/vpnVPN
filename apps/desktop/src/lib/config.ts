import { DESKTOP_ENV } from "./env";

// API configuration - set via environment variables at build time
export const API_BASE_URL = DESKTOP_ENV.API_BASE_URL;

export const DASHBOARD_URL =
  import.meta.env.VITE_DASHBOARD_URL ?? `${API_BASE_URL}/dashboard`;

// Log configuration on load (for debugging)
console.log("[config] Environment loaded:");
console.log("[config]   API_BASE_URL:", API_BASE_URL);

// Check if we're in production
export const IS_PRODUCTION = import.meta.env.PROD;

// Desktop channel (prod/staging/devel)
export const APP_CHANNEL = (DESKTOP_ENV.APP_CHANNEL || "prod").toLowerCase();

console.log("[config]   APP_CHANNEL:", APP_CHANNEL);
