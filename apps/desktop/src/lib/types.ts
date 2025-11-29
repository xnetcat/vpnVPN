export type ViewState = "disconnected" | "connecting" | "connected";
export type Protocol = "wireguard" | "openvpn" | "ikev2";

export type MapServer = {
  id: string;
  region: string;
  country?: string;
  status: string;
  sessions: number;
};

export type VpnToolsStatus = {
  wireguard_available: boolean;
  wireguard_path: string | null;
  openvpn_available: boolean;
  openvpn_path: string | null;
  ikev2_available: boolean;
  ikev2_path: string | null;
};

export type DesktopSettings = {
  preferred_protocol?: Protocol;
  auto_connect?: boolean;
  wg_quick_path?: string | null;
  openvpn_path?: string | null;
  wireguard_cli_path?: string | null;
};

export type VpnConnectionStatus = {
  is_connected: boolean;
  protocol: string | null;
  interface_name: string | null;
};

export type DaemonStatus = {
  running: boolean;
  version: string;
  uptime_secs: number;
  has_network_permission: boolean;
  has_firewall_permission: boolean;
  kill_switch_active: boolean;
};

export type OnboardingState = {
  completed: boolean;
  current_step: string;
  selected_protocol: Protocol | null;
  kill_switch_enabled: boolean;
  allow_lan: boolean;
  daemon_installed: boolean;
};

export type AppView = "main" | "settings" | "onboarding";
export type SettingsTab = "general" | "connection" | "service" | "about" | "debug";

