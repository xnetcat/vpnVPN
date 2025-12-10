import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Shield,
  Mail,
  Key,
  ArrowRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import type { ViewState, AppView, SettingsTab } from "./lib/types";
import { IS_PRODUCTION, API_BASE_URL } from "./lib/config";
import {
  applyVpnConfig,
  disconnectVpn,
  checkVpnStatus,
  openInBrowser,
  updateTrayState,
  log,
  logError,
} from "./lib/tauri";
import { setStoredSessionToken, setStoredUser } from "./lib/auth";
import {
  buildWireGuardConfig,
  buildOpenVpnConfig,
  buildIkev2Config,
} from "./lib/vpnConfig";
import {
  useUserCountry,
  useVpnTools,
  useVpnConnectionStatus,
  useDesktopSettings,
  useServers,
  useDeviceRegistration,
  useServerPubkey,
  useAuth,
  useMachineId,
  useDaemonStatus,
  useOnboarding,
} from "./lib/hooks";

import { DesktopHeader } from "./components/DesktopHeader";
import { SettingsView } from "./components/SettingsView";
import { ServerSidebar } from "./components/ServerSidebar";
import { ServerMap } from "./components/ServerMap";
import { ConnectionBar } from "./components/ConnectionBar";
import { StatusPanel } from "./components/StatusPanel";
import { ToastContainer, useToasts } from "./components/Toast";
import { OnboardingView } from "./components/OnboardingView";

// Login screen component with OTP-based authentication
function LoginScreen({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Request OTP code
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send code");
      }

      setStep("code");
    } catch (err: any) {
      logError("Failed to request OTP", err);
      setError(err.message || "Failed to send verification code");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6 || !email) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to verify code");
      }

      if (data.success && data.sessionToken) {
        // Store the session token and user for future API calls
        setStoredSessionToken(data.sessionToken);
        if (data.user) {
          setStoredUser(data.user);
        }
        log("Login successful, session token stored");
        onLoginSuccess();
      } else {
        setError("Verification failed. Please try again.");
      }
    } catch (err: any) {
      logError("OTP verification failed", err);
      setError(err.message || "Failed to verify code");
    } finally {
      setIsLoading(false);
    }
  };

  // Resend code
  const handleResendCode = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to resend code");
      }

      setError(null);
      setCode("");
    } catch (err: any) {
      logError("Failed to resend OTP", err);
      setError(err.message || "Failed to resend code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-50">
            vpnVPN Desktop
          </h1>
          <p className="mt-2 text-center text-sm text-slate-400">
            {step === "email"
              ? "Enter your email to receive a sign-in code"
              : "Enter the 6-digit code sent to your email"}
          </p>
        </div>

        {/* Step 1: Email Input */}
        {step === "email" && (
          <form onSubmit={handleRequestCode} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-300"
              >
                <Mail className="h-4 w-4 text-slate-400" />
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !email}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-semibold text-white transition-all hover:from-emerald-400 hover:to-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Send Code
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Step 2: Code Verification */}
        {step === "code" && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <p className="text-center text-sm text-emerald-300">
                Code sent to {email}
              </p>
            </div>

            <div>
              <label
                htmlFor="code"
                className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-300"
              >
                <Key className="h-4 w-4 text-slate-400" />
                Verification code
              </label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-3 text-center font-mono text-2xl tracking-[0.5em] text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                maxLength={6}
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || code.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-semibold text-white transition-all hover:from-emerald-400 hover:to-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading}
                className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
              >
                Resend Code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Loading screen component
function LoadingScreen() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-950">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600">
        <Shield className="h-8 w-8 animate-pulse text-white" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-slate-50">vpnVPN</h1>
      <p className="mt-2 text-sm text-slate-400">Loading...</p>
    </div>
  );
}

export default function App() {
  // Auth state
  const {
    isAuthenticated,
    isLoading: authLoading,
    signOut,
    checkAuth,
  } = useAuth();

  // View state - initialize based on onboarding
  const [appView, setAppView] = useState<AppView>("main");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");

  // Onboarding and daemon status
  const {
    state: onboardingState,
    needsOnboarding,
    completeOnboarding,
  } = useOnboarding();
  const {
    status: daemonStatus,
    isLoading: isDaemonLoading,
    isDevelopment,
    refreshStatus: refreshDaemonStatus,
    startDaemon,
    stopDaemon,
    restartDaemon: restartDaemonFn,
    repairDaemon,
    uninstallDaemon,
    requestPermissions,
    updateDaemon,
  } = useDaemonStatus();

  // VPN connection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<ViewState>("disconnected");
  const [config, setConfig] = useState<string | null>(null);
  const [hasAttemptedAutoConnect, setHasAttemptedAutoConnect] = useState(false);

  // Toast notifications
  const { toasts, removeToast, warning, info, error: showError } = useToasts();

  // Custom hooks
  const userCountry = useUserCountry();
  const {
    vpnTools,
    refreshTools,
    updateBinaryPaths,
    isRefreshing,
    isUpdating,
  } = useVpnTools();
  const vpnConnectionStatus = useVpnConnectionStatus(status);
  const {
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
  } = useDesktopSettings();

  // Data fetching
  const {
    servers,
    isLoading: serversLoading,
    refetch: refetchServers,
  } = useServers();
  const { registerDevice, confirmConnection, cancelConnection } =
    useDeviceRegistration();
  const wgServerPublicKey = useServerPubkey();
  const machineId = useMachineId();

  const selectedServer =
    servers.find((s) => s.id === selectedId) ?? servers[0] ?? null;

  // Log component mount
  useEffect(() => {
    log("App mounted, API_BASE_URL:", API_BASE_URL);
    return () => log("App unmounted");
  }, []);

  // Check if the selected protocol's tool is available
  const isCurrentProtocolAvailable = useMemo(() => {
    if (!vpnTools) return false;
    switch (protocol) {
      case "wireguard":
        return vpnTools.wireguard.available;
      case "openvpn":
        return vpnTools.openvpn.available;
      case "ikev2":
        return vpnTools.ikev2.available;
    }
  }, [vpnTools, protocol]);

  // Auto-connect on launch (only if tool is available and not IKEv2)
  useEffect(() => {
    if (
      !autoConnect ||
      hasAttemptedAutoConnect ||
      !selectedServer ||
      status !== "disconnected" ||
      !isCurrentProtocolAvailable ||
      protocol === "ikev2" ||
      !isAuthenticated
    ) {
      return;
    }
    setHasAttemptedAutoConnect(true);
    void handleConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoConnect,
    hasAttemptedAutoConnect,
    selectedServer,
    status,
    isCurrentProtocolAvailable,
    protocol,
    isAuthenticated,
  ]);

  // Monitor VPN status and detect auto-disconnect due to lost internet
  useEffect(() => {
    if (status !== "connected") {
      return;
    }

    let previousStatus: boolean | null = null;
    const interval = setInterval(async () => {
      try {
        const vpnStatus = await checkVpnStatus();
        const isConnected = vpnStatus?.is_connected ?? false;

        // Detect transition from connected to disconnected
        if (previousStatus === true && !isConnected) {
          warning("VPN disconnected automatically - internet connection lost");
          setStatus("disconnected");
        }

        previousStatus = isConnected;
      } catch (e) {
        logError("Failed to check VPN status during monitoring", e);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [status, warning]);

  const handleConnect = async () => {
    if (!selectedServer) return;
    if (!isCurrentProtocolAvailable) {
      showError(
        `${protocol === "wireguard" ? "WireGuard" : protocol === "openvpn" ? "OpenVPN" : "IKEv2"} is not installed. Check Settings → Connection for installation instructions.`,
      );
      return;
    }
    // IKEv2 note: When CLI tool is available, we can open the config file
    // but cannot verify connection status programmatically
    if (protocol === "ikev2" && !vpnTools?.ikev2.available) {
      showError(
        "IKEv2/IPsec is not available on this system. Please install strongSwan or use a different protocol.",
      );
      return;
    }

    setStatus("connecting");
    setConfig(null);

    let deviceId: string | null = null;
    let localPrivateKey: string | null = null;

    try {
      // Generate WireGuard keys locally for better security (desktop app only)
      let publicKey: string | undefined;
      if (protocol === "wireguard") {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const [privateKey, pubKey] = await invoke<[string, string]>(
            "generate_wireguard_keys",
          );
          localPrivateKey = privateKey;
          publicKey = pubKey;
          console.log(
            "[App] Generated WireGuard keys locally (private key not sent to server)",
          );
        } catch (e) {
          console.warn(
            "[App] Failed to generate keys locally, falling back to server-side:",
            e,
          );
          // Fall back to server-side generation if wg genkey is not available
        }
      }

      const result = await registerDevice({
        name: `Desktop • ${selectedServer.region}`,
        serverId: selectedServer.id,
        machineId: machineId ?? undefined,
        publicKey, // Send only public key if generated locally
      });

      deviceId = result.deviceId;

      let cfg: string;
      if (protocol === "wireguard") {
        console.log("[App] Building WireGuard config with:");
        console.log(
          "[App]   selectedServer.publicIp:",
          selectedServer.publicIp,
        );
        console.log(
          "[App]   selectedServer.metadata:",
          selectedServer.metadata,
        );
        console.log("[App]   wgServerPublicKey:", wgServerPublicKey);

        // Use locally generated private key if available, otherwise use server-provided one
        const privateKey = localPrivateKey || result.privateKey;
        if (!privateKey) {
          throw new Error(
            "No private key available for WireGuard configuration",
          );
        }

        // Determine endpoint: use server's publicIp if available, otherwise fall back to localhost for dev
        // In local dev, VPN node is typically on localhost:51820
        const endpoint =
          selectedServer.publicIp ||
          (process.env.NODE_ENV === "development" ? "localhost" : undefined);

        cfg = buildWireGuardConfig({
          privateKey,
          assignedIp: result.assignedIp,
          serverPublicKeyOverride: wgServerPublicKey || undefined,
          endpointOverride: endpoint,
          portOverride: selectedServer.metadata?.port || 51820,
        });

        console.log("[App] Generated WireGuard config:\n", cfg);
      } else if (protocol === "openvpn") {
        cfg = buildOpenVpnConfig({
          assignedIp: result.assignedIp,
          serverName: selectedServer.region,
        });
      } else {
        cfg = buildIkev2Config({
          serverName: selectedServer.region,
        });
      }

      setConfig(cfg);
      try {
        await applyVpnConfig(protocol, cfg);

        // For IKEv2, we can't verify connection status - it opens the config file
        // for manual import into System Settings
        if (protocol === "ikev2") {
          info(
            "IKEv2 config file opened. Please import it into your System Settings to complete the connection.",
          );
          setStatus("disconnected");
          // Don't confirm the device since we can't verify the connection
          if (deviceId) {
            await cancelConnection(deviceId);
          }
          return;
        }

        // Wait for VPN to initialize and peer to sync to VPN node
        // VPN node syncs peers every 10 seconds, so we need to wait and retry
        let vpnStatus = null;
        const maxRetries = 6; // 6 attempts over ~12 seconds
        const retryDelay = 2000; // 2 seconds between attempts

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));

          vpnStatus = await checkVpnStatus();
          if (vpnStatus?.is_connected) {
            break;
          }

          if (attempt < maxRetries - 1) {
            log(
              `VPN connection not ready yet (attempt ${attempt + 1}/${maxRetries}), waiting for peer sync...`,
            );
          }
        }

        if (vpnStatus?.is_connected) {
          setStatus("connected");
          log("VPN connection verified:", vpnStatus);
          // Confirm the connection - this sends the email and marks device as active
          if (deviceId) {
            await confirmConnection(deviceId);
          }
        } else {
          warning(
            "VPN config applied but connection could not be verified after multiple attempts. " +
              "The peer may not have synced to the VPN node yet. Please try again in a few seconds.",
          );
          setStatus("disconnected");
          log("VPN connection not verified after retries:", vpnStatus);
          // Don't cancel immediately - give user a chance to retry
          // The device will be cleaned up by the pending device cleanup job if not confirmed
        }
      } catch (e) {
        logError("Failed to apply VPN config via Tauri", e);
        warning(
          "Config generated, but failed to apply VPN settings locally. You may need to import it manually.",
        );
        // Config was generated but not applied - stay disconnected
        setStatus("disconnected");
        // Cancel the connection - cleans up the pending device
        if (deviceId) {
          await cancelConnection(deviceId);
        }
      }
    } catch (e: any) {
      setStatus("disconnected");
      const errorMessage = e.message ?? "Failed to connect to VPN server";

      // Check if it's a device limit error
      if (
        errorMessage.toLowerCase().includes("device limit") ||
        errorMessage.toLowerCase().includes("forbidden")
      ) {
        showError(
          "Device limit reached. Remove an existing device to connect a new one.",
          0,
          {
            label: "Manage Devices",
            onClick: () => {
              void openInBrowser(`${API_BASE_URL}/devices`);
            },
          },
        );
      } else {
        showError(errorMessage);
      }

      // If device was created but connection failed, cancel it
      if (deviceId) {
        await cancelConnection(deviceId);
      }
    }
  };

  const handleDisconnect = useCallback(() => {
    setConfig(null);
    setStatus("disconnected");
    void disconnectVpn(protocol).catch((e) =>
      logError("Failed to disconnect VPN via Tauri", e),
    );
  }, [protocol]);

  // Update system tray state when VPN status or settings change
  useEffect(() => {
    void updateTrayState({
      connected: status === "connected",
      killSwitchEnabled: daemonStatus?.kill_switch_active ?? false,
      autoStartEnabled: autoConnect,
      serverName: status === "connected" ? selectedServer?.region : undefined,
    });
  }, [
    status,
    daemonStatus?.kill_switch_active,
    autoConnect,
    selectedServer?.region,
  ]);

  // Listen for tray events
  useEffect(() => {
    let unlisten: (() => void)[] = [];

    const setupListeners = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        // Connect from tray
        const unlistenConnect = await listen("tray-connect", () => {
          log("Tray: Connect requested");
          if (status === "disconnected" && selectedServer) {
            void handleConnect();
          }
        });
        unlisten.push(unlistenConnect);

        // Disconnect from tray
        const unlistenDisconnect = await listen("tray-disconnect", () => {
          log("Tray: Disconnect requested");
          if (status === "connected") {
            handleDisconnect();
          }
        });
        unlisten.push(unlistenDisconnect);

        // Toggle kill switch from tray
        const unlistenKillSwitch = await listen(
          "tray-toggle-kill-switch",
          async () => {
            log("Tray: Toggle kill switch");
            try {
              const { enableKillSwitch, disableKillSwitch } = await import(
                "./lib/tauri"
              );
              if (daemonStatus?.kill_switch_active) {
                await disableKillSwitch();
              } else {
                await enableKillSwitch(true);
              }
              refreshDaemonStatus();
            } catch (e) {
              logError("Failed to toggle kill switch", e);
            }
          },
        );
        unlisten.push(unlistenKillSwitch);

        // Toggle auto-start from tray
        const unlistenAutoStart = await listen("tray-toggle-auto-start", () => {
          log("Tray: Toggle auto-start");
          setAutoConnect(!autoConnect);
        });
        unlisten.push(unlistenAutoStart);

        // Open settings from tray
        const unlistenSettings = await listen("tray-open-settings", () => {
          log("Tray: Open settings");
          setAppView("settings");
        });
        unlisten.push(unlistenSettings);
      } catch (e) {
        logError("Failed to set up tray listeners", e);
      }
    };

    void setupListeners();

    return () => {
      unlisten.forEach((fn) => fn());
    };
  }, [
    status,
    selectedServer,
    daemonStatus?.kill_switch_active,
    autoConnect,
    handleDisconnect,
    refreshDaemonStatus,
  ]);

  const handleSelectServer = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const handleLoginSuccess = useCallback(() => {
    void checkAuth();
  }, [checkAuth]);

  // Debug info for settings
  const debugInfo = useMemo(
    () => ({
      isConnected: status === "connected",
      connectionStatus: status,
      actuallyConnected: vpnConnectionStatus?.is_connected ?? false,
      actualProtocol: vpnConnectionStatus?.protocol ?? null,
      interfaceName: vpnConnectionStatus?.interface_name ?? null,
      selectedServerId: selectedServer?.id ?? null,
      selectedServerRegion: selectedServer?.region ?? null,
      protocol,
      wgServerPublicKey,
      isProduction: IS_PRODUCTION,
      tauriAvailable: true,
      userCountry,
    }),
    [
      status,
      vpnConnectionStatus,
      selectedServer,
      protocol,
      wgServerPublicKey,
      userCountry,
    ],
  );

  // Show loading screen while checking auth
  if (authLoading) {
    return <LoadingScreen />;
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // Show onboarding if not completed
  if (needsOnboarding) {
    return (
      <OnboardingView
        onComplete={async (state) => {
          await completeOnboarding({
            completed: true,
            current_step: "complete",
            selected_protocol: state.selected_protocol,
            kill_switch_enabled: state.kill_switch_enabled,
            allow_lan: state.allow_lan,
            daemon_installed: state.daemon_installed,
          });
          // Apply settings from onboarding
          if (state.selected_protocol) {
            setProtocol(state.selected_protocol);
          }
        }}
        initialState={onboardingState || undefined}
      />
    );
  }

  // Settings view
  if (appView === "settings") {
    return (
      <div className="flex h-screen flex-col bg-slate-950 text-slate-50">
        <SettingsView
          activeTab={settingsTab}
          setActiveTab={setSettingsTab}
          protocol={protocol}
          setProtocol={setProtocol}
          autoConnect={autoConnect}
          setAutoConnect={setAutoConnect}
          wgQuickPath={wgQuickPath}
          setWgQuickPath={setWgQuickPath}
          openvpnPath={openvpnPath}
          setOpenvpnPath={setOpenvpnPath}
          wireguardCliPath={wireguardCliPath}
          setWireguardCliPath={setWireguardCliPath}
          vpnTools={vpnTools}
          onRefreshTools={refreshTools}
          isRefreshingTools={isRefreshing}
          debugInfo={debugInfo}
          onBack={() => setAppView("main")}
          daemonStatus={daemonStatus}
          isDaemonLoading={isDaemonLoading}
          onRefreshDaemonStatus={refreshDaemonStatus}
          onStartDaemon={startDaemon}
          onStopDaemon={stopDaemon}
          onRestartDaemon={restartDaemonFn}
          onUninstallDaemon={uninstallDaemon}
          onRequestPermissions={requestPermissions}
          isDevelopment={isDevelopment}
          onUpdateDaemon={updateDaemon}
        />
      </div>
    );
  }

  // Check if daemon is not running
  const isDaemonNotRunning =
    !isDaemonLoading && (!daemonStatus || !daemonStatus.running);

  // Main view
  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-50">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Daemon Warning Banner */}
      {isDaemonNotRunning && (
        <div className="flex items-center justify-between border-b border-amber-500/30 bg-amber-500/10 px-4 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-sm text-amber-300">
              VPN service is not running. Kill switch and VPN connections
              require the service to be active.
            </span>
          </div>
          <button
            onClick={() => {
              setAppView("settings");
              setSettingsTab("service");
            }}
            className="rounded-lg bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/30"
          >
            Fix Now
          </button>
        </div>
      )}

      <DesktopHeader
        status={status}
        onSettingsClick={() => setAppView("settings")}
        onSignOut={handleSignOut}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ServerSidebar
          servers={servers}
          selectedServer={selectedServer}
          onSelectServer={handleSelectServer}
          onConnect={handleConnect}
          status={status}
          protocol={protocol}
          onRefresh={refetchServers}
          isRefreshing={serversLoading}
        />

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ConnectionBar
            selectedServer={selectedServer}
            status={status}
            protocol={protocol}
            vpnTools={vpnTools}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />

          <ServerMap
            servers={servers}
            selectedServer={selectedServer}
            userCountry={userCountry}
            onSelectServer={handleSelectServer}
            onConnect={handleConnect}
            status={status}
            protocol={protocol}
          />

          <StatusPanel protocol={protocol} hasConfig={config !== null} />
        </main>
      </div>
    </div>
  );
}
