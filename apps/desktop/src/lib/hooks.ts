import { useEffect, useState, useCallback } from "react";
import type {
  Protocol,
  VpnToolsStatus,
  VpnConnectionStatus,
  MapServer,
  DaemonStatus,
  OnboardingState,
} from "./types";
import { TIMEZONE_TO_COUNTRY } from "./constants";
import { API_BASE_URL, WG_SERVER_PUBLIC_KEY } from "./config";
import {
  detectVpnTools,
  refreshVpnTools as refreshVpnToolsTauri,
  updateVpnBinaryPaths,
  checkVpnStatus,
  getDesktopSettings,
  updateDesktopSettings,
  getMachineId,
  getDaemonStatus,
  getOnboardingState,
  saveOnboardingState,
  installDaemon,
  restartDaemon,
  isDevelopmentMode,
  updateDaemonDev,
  log,
  logError,
} from "./tauri";
import type { VpnBinaryPaths } from "./types";
import {
  authFetch,
  getStoredSessionToken,
  getStoredUser,
  setStoredSessionToken,
  setStoredUser,
  clearStoredSessionToken,
} from "./auth";

// Hook to detect user's country from timezone
export function useUserCountry(): string | null {
  const [userCountry, setUserCountry] = useState<string | null>(null);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const country = TIMEZONE_TO_COUNTRY[tz] ?? "US";
    setUserCountry(country);
    log("Detected user country from timezone:", country);
  }, []);

  return userCountry;
}

// Hook to detect VPN tools availability with refresh and update capability
export function useVpnTools(): {
  vpnTools: VpnToolsStatus | null;
  refreshTools: () => Promise<void>;
  updateBinaryPaths: (paths: VpnBinaryPaths) => Promise<void>;
  isRefreshing: boolean;
  isUpdating: boolean;
} {
  const [vpnTools, setVpnTools] = useState<VpnToolsStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Initial detection
  const refreshTools = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Try daemon refresh first, fall back to basic detection
      let tools = await refreshVpnToolsTauri();
      if (!tools) {
        tools = await detectVpnTools();
      }
      if (tools) {
        setVpnTools(tools);
        log("Detected VPN tools:", tools);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Update binary paths and refresh
  const updateBinaryPaths = useCallback(async (paths: VpnBinaryPaths) => {
    setIsUpdating(true);
    try {
      log("Updating binary paths:", paths);
      const tools = await updateVpnBinaryPaths(paths);
      if (tools) {
        setVpnTools(tools);
        log("Updated VPN tools after path change:", tools);
      }
    } finally {
      setIsUpdating(false);
    }
  }, []);

  useEffect(() => {
    void refreshTools();
  }, [refreshTools]);

  return {
    vpnTools,
    refreshTools,
    updateBinaryPaths,
    isRefreshing,
    isUpdating,
  };
}

// Hook to check actual VPN connection status from the system
export function useVpnConnectionStatus(
  appStatus: "disconnected" | "connecting" | "connected",
  pollInterval = 5000
): VpnConnectionStatus | null {
  const [connectionStatus, setConnectionStatus] =
    useState<VpnConnectionStatus | null>(null);

  const checkStatus = useCallback(async () => {
    const status = await checkVpnStatus();
    if (status) {
      setConnectionStatus(status);
      log("VPN connection status:", status);
    }
  }, []);

  // Check status on mount and when app status changes
  useEffect(() => {
    void checkStatus();
  }, [checkStatus, appStatus]);

  // Poll for status when connected
  useEffect(() => {
    if (appStatus !== "connected") return;

    const interval = setInterval(() => {
      void checkStatus();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [appStatus, pollInterval, checkStatus]);

  return connectionStatus;
}

// Hook to manage desktop settings with Tauri persistence
export function useDesktopSettings() {
  const [protocol, setProtocol] = useState<Protocol>("wireguard");
  const [autoConnect, setAutoConnect] = useState(false);
  const [wgQuickPath, setWgQuickPath] = useState("");
  const [openvpnPath, setOpenvpnPath] = useState("");
  const [wireguardCliPath, setWireguardCliPath] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from Tauri on mount
  useEffect(() => {
    (async () => {
      const settings = await getDesktopSettings();
      if (settings) {
        if (settings.preferred_protocol) {
          setProtocol(settings.preferred_protocol);
        }
        if (typeof settings.auto_connect === "boolean") {
          setAutoConnect(settings.auto_connect);
        }
        setWgQuickPath(settings.wg_quick_path ?? "");
        setOpenvpnPath(settings.openvpn_path ?? "");
        setWireguardCliPath(settings.wireguard_cli_path ?? "");
      }
      setIsLoaded(true);
    })();
  }, []);

  // Save settings to Tauri when they change
  useEffect(() => {
    if (!isLoaded) return;

    void updateDesktopSettings({
      preferredProtocol: protocol,
      autoConnect,
      wgQuickPath,
      openvpnPath,
      wireguardCliPath,
    });
  }, [
    protocol,
    autoConnect,
    wgQuickPath,
    openvpnPath,
    wireguardCliPath,
    isLoaded,
  ]);

  return {
    protocol,
    setProtocol,
    autoConnect,
    setAutoConnect,
    wgQuickPath,
    setWgQuickPath,
    openvpnPath,
    setOpenvpnPath,
    wireguardCliPath,
    setWireguardCliPath,
    isLoaded,
  };
}

// Hook to fetch servers from the API
export function useServers() {
  const [servers, setServers] = useState<MapServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/trpc/servers.list`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Handle tRPC response format
      const result =
        data?.result?.data?.json ?? data?.result?.data ?? data ?? [];
      setServers(Array.isArray(result) ? result : []);
    } catch (e: any) {
      logError("Failed to fetch servers:", e);
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  return { servers, isLoading, error, refetch: fetchServers };
}

// Hook to get unique machine identifier
export function useMachineId(): string | null {
  const [machineId, setMachineId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const id = await getMachineId();
      if (id) {
        setMachineId(id);
        log("Machine ID:", id);
      }
    })();
  }, []);

  return machineId;
}

// Hook to register a device
export function useDeviceRegistration() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerDevice = useCallback(
    async (params: { name: string; serverId?: string; machineId?: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await authFetch(
          `${API_BASE_URL}/api/trpc/device.register`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ json: params }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        return data?.result?.data?.json ?? data?.result?.data ?? data;
      } catch (e: any) {
        logError("Failed to register device:", e);
        setError(e.message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Confirm connection - call this after VPN connection is verified
  const confirmConnection = useCallback(async (deviceId: string) => {
    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/trpc/device.confirmConnection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: { deviceId } }),
        }
      );
      if (!res.ok) {
        logError("Failed to confirm connection:", res.status);
      }
    } catch (e) {
      logError("Failed to confirm connection:", e);
    }
  }, []);

  // Cancel connection - call this if VPN connection fails
  const cancelConnection = useCallback(async (deviceId: string) => {
    try {
      const res = await authFetch(
        `${API_BASE_URL}/api/trpc/device.cancelConnection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json: { deviceId } }),
        }
      );
      if (!res.ok) {
        logError("Failed to cancel connection:", res.status);
      }
    } catch (e) {
      logError("Failed to cancel connection:", e);
    }
  }, []);

  return {
    registerDevice,
    confirmConnection,
    cancelConnection,
    isLoading,
    error,
  };
}

// Hook to get server public key
export function useServerPubkey() {
  const [pubkey, setPubkey] = useState<string>(WG_SERVER_PUBLIC_KEY);

  useEffect(() => {
    if (pubkey) return;

    (async () => {
      try {
        const res = await authFetch(
          `${API_BASE_URL}/api/trpc/desktop.serverPubkey`
        );
        if (!res.ok) return;
        const data = await res.json();
        const key =
          data?.result?.data?.json?.publicKey ?? data?.result?.data?.publicKey;
        if (key) setPubkey(key);
      } catch (e) {
        logError("Failed to fetch server pubkey:", e);
      }
    })();
  }, [pubkey]);

  return pubkey;
}

// Hook to check authentication status
export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<{
    id: string;
    email?: string;
    name?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    setIsLoading(true);

    // First check if we have a stored token
    const storedToken = getStoredSessionToken();
    const storedUser = getStoredUser();

    if (!storedToken) {
      setIsAuthenticated(false);
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      // Validate the token with the server
      const res = await authFetch(`${API_BASE_URL}/api/auth/session`);
      if (!res.ok) {
        // Token is invalid, clear it
        clearStoredSessionToken();
        setIsAuthenticated(false);
        setUser(null);
        return;
      }
      const data = await res.json();
      if (data?.user) {
        setIsAuthenticated(true);
        setUser(data.user);
        // Update stored user in case it changed
        setStoredUser(data.user);
      } else {
        // No user in response, clear stored data
        clearStoredSessionToken();
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (e) {
      logError("Failed to check auth:", e);
      // On network error, trust stored data if available
      if (storedUser) {
        setIsAuthenticated(true);
        setUser(storedUser);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const signOut = useCallback(async () => {
    try {
      await authFetch(`${API_BASE_URL}/api/auth/signout`, {
        method: "POST",
      });
    } catch (e) {
      logError("Sign out failed:", e);
    }
    clearStoredSessionToken();
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  return { isAuthenticated, user, isLoading, checkAuth, signOut };
}

// Hook to manage daemon status
export function useDaemonStatus() {
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDev, setIsDev] = useState(false);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const daemonStatus = await getDaemonStatus();
      setStatus(daemonStatus);
    } catch (e) {
      logError("Failed to get daemon status:", e);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    // Check if development mode
    isDevelopmentMode()
      .then(setIsDev)
      .catch(() => setIsDev(false));
    // Poll every 10 seconds
    const interval = setInterval(() => void refreshStatus(), 10000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const handleStartDaemon = useCallback(async () => {
    try {
      await installDaemon();
      await refreshStatus();
    } catch (e) {
      logError("Failed to start daemon:", e);
      throw e;
    }
  }, [refreshStatus]);

  const handleStopDaemon = useCallback(async () => {
    // Stop is typically done by uninstalling on most platforms
    logError("Stop daemon not directly supported - use restart or uninstall");
  }, []);

  const handleRestartDaemon = useCallback(async () => {
    try {
      await restartDaemon();
      // Wait a bit for restart
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await refreshStatus();
    } catch (e) {
      logError("Failed to restart daemon:", e);
      throw e;
    }
  }, [refreshStatus]);

  const handleRepairDaemon = useCallback(async () => {
    try {
      await installDaemon();
      await refreshStatus();
    } catch (e) {
      logError("Failed to repair daemon:", e);
      throw e;
    }
  }, [refreshStatus]);

  const handleRequestPermissions = useCallback(async () => {
    // Permissions are typically granted during install
    await handleRepairDaemon();
  }, [handleRepairDaemon]);

  const handleUpdateDaemon = useCallback(async () => {
    try {
      await updateDaemonDev();
      // Wait a bit for restart
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await refreshStatus();
    } catch (e) {
      logError("Failed to update daemon:", e);
      throw e;
    }
  }, [refreshStatus]);

  return {
    status,
    isLoading,
    isDevelopment: isDev,
    refreshStatus,
    startDaemon: handleStartDaemon,
    stopDaemon: handleStopDaemon,
    restartDaemon: handleRestartDaemon,
    repairDaemon: handleRepairDaemon,
    requestPermissions: handleRequestPermissions,
    updateDaemon: handleUpdateDaemon,
  };
}

// Hook to manage onboarding state
export function useOnboarding() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const onboardingState = await getOnboardingState();
        setState(onboardingState);
      } catch (e) {
        logError("Failed to get onboarding state:", e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const completeOnboarding = useCallback(async (newState: OnboardingState) => {
    try {
      await saveOnboardingState(newState);
      setState(newState);
    } catch (e) {
      logError("Failed to save onboarding state:", e);
    }
  }, []);

  const resetOnboarding = useCallback(async () => {
    const defaultState: OnboardingState = {
      completed: false,
      current_step: "welcome",
      selected_protocol: null,
      kill_switch_enabled: false,
      allow_lan: true,
      daemon_installed: false,
    };
    try {
      await saveOnboardingState(defaultState);
      setState(defaultState);
    } catch (e) {
      logError("Failed to reset onboarding state:", e);
    }
  }, []);

  return {
    state,
    isLoading,
    needsOnboarding: !isLoading && (!state || !state.completed),
    completeOnboarding,
    resetOnboarding,
  };
}
