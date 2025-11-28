import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import type {
  Protocol,
  VpnToolsStatus,
  DesktopSettings,
  VpnConnectionStatus,
} from "./types";

// Logging helpers
export const log = (...args: unknown[]) => {
  console.log("[desktop]", ...args);
};

export const logError = (...args: unknown[]) => {
  console.error("[desktop]", ...args);
};

// VPN config operations
export async function applyVpnConfig(
  protocol: Protocol,
  config: string
): Promise<void> {
  await invoke("apply_vpn_config", { protocol, config });
}

export async function disconnectVpn(protocol: Protocol): Promise<void> {
  await invoke("disconnect_vpn", { protocol });
}

// VPN tools detection
export async function detectVpnTools(): Promise<VpnToolsStatus | null> {
  try {
    return await invoke<VpnToolsStatus>("detect_vpn_tools");
  } catch (e) {
    logError("Failed to detect VPN tools", e);
    return null;
  }
}

// VPN connection status
export async function checkVpnStatus(): Promise<VpnConnectionStatus | null> {
  try {
    return await invoke<VpnConnectionStatus>("check_vpn_status");
  } catch (e) {
    logError("Failed to check VPN status", e);
    return null;
  }
}

// Desktop settings
export async function getDesktopSettings(): Promise<DesktopSettings | null> {
  try {
    return await invoke<DesktopSettings>("get_desktop_settings");
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
  try {
    await invoke("update_desktop_settings", settings);
  } catch (e) {
    logError("Failed to update desktop settings", e);
  }
}

// Health check
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await invoke<{ ok: boolean }>("health_check");
    return result.ok;
  } catch (e) {
    logError("Health check failed", e);
    return false;
  }
}

// Get unique machine identifier
export async function getMachineId(): Promise<string | null> {
  try {
    return await invoke<string>("get_machine_id");
  } catch (e) {
    logError("Failed to get machine ID", e);
    return null;
  }
}

// Open URL in default browser
export async function openInBrowser(url: string): Promise<void> {
  try {
    await open(url);
  } catch (e) {
    logError("Failed to open URL in browser", e);
  }
}

