import type { Protocol, VpnToolsStatus, MapServer, DesktopSettings } from "./types";
import { COUNTRY_COORDS, REGION_TO_COUNTRY } from "./constants";

// Client-side logging helper
export const log = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.log("[DesktopShell]", ...args);
};

export const logError = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.error("[DesktopShell]", ...args);
};

// Check if we're running inside Tauri desktop shell
export function isDesktopShell(): boolean {
  if (typeof window === "undefined") return false;
  const anyWin = window as any;
  return Boolean(anyWin.__TAURI__?.core?.invoke);
}

// Tauri command wrappers
export async function applyVpnConfig(
  protocol: Protocol,
  config: string
): Promise<void> {
  if (!isDesktopShell()) return;
  const anyWin = window as any;
  await anyWin.__TAURI__.core.invoke("apply_vpn_config", { protocol, config });
}

export async function disconnectVpn(protocol: Protocol): Promise<void> {
  if (!isDesktopShell()) return;
  const anyWin = window as any;
  await anyWin.__TAURI__.core.invoke("disconnect_vpn", { protocol });
}

export async function detectVpnTools(): Promise<VpnToolsStatus | null> {
  if (!isDesktopShell()) return null;
  const anyWin = window as any;
  try {
    return await anyWin.__TAURI__.core.invoke("detect_vpn_tools");
  } catch (e) {
    logError("Failed to detect VPN tools", e);
    return null;
  }
}

export async function getDesktopSettings(): Promise<DesktopSettings | null> {
  if (!isDesktopShell()) return null;
  const anyWin = window as any;
  try {
    return await anyWin.__TAURI__.core.invoke("get_desktop_settings");
  } catch (e) {
    logError("Failed to get desktop settings", e);
    return null;
  }
}

export async function updateDesktopSettings(settings: {
  preferredProtocol?: string;
  autoConnect?: boolean;
  wgQuickPath?: string;
  openvpnPath?: string;
  wireguardCliPath?: string;
}): Promise<void> {
  if (!isDesktopShell()) return;
  const anyWin = window as any;
  try {
    await anyWin.__TAURI__.core.invoke("update_desktop_settings", settings);
  } catch (e) {
    logError("Failed to update desktop settings", e);
  }
}

// Convert lat/lng to map percentage positions
export function coordsToMapPosition(
  lat: number,
  lng: number
): { top: string; left: string } {
  // Map bounds: lat -60 to 80, lng -180 to 180
  // Convert to 0-100% with padding
  const latPercent = ((80 - lat) / 140) * 80 + 10; // 10-90%
  const lngPercent = ((lng + 180) / 360) * 80 + 10; // 10-90%
  return { top: `${latPercent}%`, left: `${lngPercent}%` };
}

// Get position for a server based on country or region
export function positionForServer(
  server: MapServer,
  userCountry: string | null
): { top: string; left: string } {
  // First, try to use the server's country code
  if (server.country && COUNTRY_COORDS[server.country]) {
    const coords = COUNTRY_COORDS[server.country];
    return coordsToMapPosition(coords.lat, coords.lng);
  }

  // Try to infer country from region (AWS region code)
  const countryFromRegion = REGION_TO_COUNTRY[server.region.toLowerCase()];
  if (countryFromRegion && COUNTRY_COORDS[countryFromRegion]) {
    const coords = COUNTRY_COORDS[countryFromRegion];
    return coordsToMapPosition(coords.lat, coords.lng);
  }

  // For "local" servers, use user's detected country
  if (
    server.region.toLowerCase() === "local" &&
    userCountry &&
    COUNTRY_COORDS[userCountry]
  ) {
    const coords = COUNTRY_COORDS[userCountry];
    return coordsToMapPosition(coords.lat, coords.lng);
  }

  // Fallback: hash-based positioning
  let hash = 0;
  for (let i = 0; i < server.id.length; i++) {
    hash = (hash * 31 + server.id.charCodeAt(i)) >>> 0;
  }
  const top = 10 + (hash % 70);
  const left = 10 + ((hash >> 8) % 80);
  return { top: `${top}%`, left: `${left}%` };
}

// Get protocol display label
export function getProtocolLabel(protocol: Protocol): string {
  switch (protocol) {
    case "wireguard":
      return "WireGuard";
    case "openvpn":
      return "OpenVPN";
    case "ikev2":
      return "IKEv2 / IPsec";
  }
}

