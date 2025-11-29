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
    // Tauri expects parameter name as key
    await invoke("update_desktop_settings", {
      update: {
        preferred_protocol: settings.preferredProtocol,
        auto_connect: settings.autoConnect,
        wg_quick_path: settings.wgQuickPath,
        openvpn_path: settings.openvpnPath,
        wireguard_cli_path: settings.wireguardCliPath,
      },
    });
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

// ============ Daemon operations ============

import type { DaemonStatus, OnboardingState } from "./types";

// Check if daemon is available
export async function isDaemonAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("is_daemon_available");
  } catch (e) {
    logError("Failed to check daemon availability", e);
    return false;
  }
}

// Get daemon status
export async function getDaemonStatus(): Promise<DaemonStatus | null> {
  try {
    return await invoke<DaemonStatus>("get_daemon_status");
  } catch (e) {
    logError("Failed to get daemon status", e);
    return null;
  }
}

// Enable kill switch
export async function enableKillSwitch(allowLan: boolean): Promise<void> {
  await invoke("enable_kill_switch", { allowLan });
}

// Disable kill switch
export async function disableKillSwitch(): Promise<void> {
  await invoke("disable_kill_switch");
}

// Restart daemon
export async function restartDaemon(): Promise<void> {
  await invoke("restart_daemon");
}

// Install daemon
export async function installDaemon(): Promise<void> {
  await invoke("install_daemon");
}

// Uninstall daemon
export async function uninstallDaemon(): Promise<void> {
  await invoke("uninstall_daemon");
}

// Get onboarding state
export async function getOnboardingState(): Promise<OnboardingState | null> {
  try {
    return await invoke<OnboardingState>("get_onboarding_state");
  } catch (e) {
    logError("Failed to get onboarding state", e);
    return null;
  }
}

// Save onboarding state
export async function saveOnboardingState(state: OnboardingState): Promise<void> {
  await invoke("save_onboarding_state", { state });
}

// Check if running in development mode
export async function isDevelopmentMode(): Promise<boolean> {
  try {
    return await invoke<boolean>("is_development");
  } catch (e) {
    logError("Failed to check development mode", e);
    return false;
  }
}

// Update daemon in development mode (build and reinstall)
export async function updateDaemonDev(): Promise<void> {
  await invoke("update_daemon_dev");
}

// ============ System Tray operations ============

// Update system tray state
export async function updateTrayState(params: {
  connected: boolean;
  killSwitchEnabled: boolean;
  autoStartEnabled: boolean;
  serverName?: string;
}): Promise<void> {
  try {
    await invoke("update_tray_state", {
      connected: params.connected,
      killSwitchEnabled: params.killSwitchEnabled,
      autoStartEnabled: params.autoStartEnabled,
      serverName: params.serverName ?? null,
    });
  } catch (e) {
    logError("Failed to update tray state", e);
  }
}

