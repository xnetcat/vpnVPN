import { useEffect, useMemo, useState, useCallback } from "react";
import { Shield, Mail, Key, ArrowRight, Loader2 } from "lucide-react";

import type { ViewState, AppView, SettingsTab } from "./lib/types";
import { IS_PRODUCTION, API_BASE_URL } from "./lib/config";
import { applyVpnConfig, disconnectVpn, log, logError } from "./lib/tauri";
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
} from "./lib/hooks";

import { DesktopHeader } from "./components/DesktopHeader";
import { SettingsView } from "./components/SettingsView";
import { ServerSidebar } from "./components/ServerSidebar";
import { ServerMap } from "./components/ServerMap";
import { ConnectionBar } from "./components/ConnectionBar";
import { StatusPanel } from "./components/StatusPanel";

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
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to verify code");
      }

      if (data.success) {
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

  // View state
  const [appView, setAppView] = useState<AppView>("main");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");

  // VPN connection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<ViewState>("disconnected");
  const [config, setConfig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedAutoConnect, setHasAttemptedAutoConnect] = useState(false);

  // Custom hooks
  const userCountry = useUserCountry();
  const { vpnTools, refreshTools, isRefreshing } = useVpnTools();
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
  const { registerDevice } = useDeviceRegistration();
  const wgServerPublicKey = useServerPubkey();

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
        return vpnTools.wireguard_available;
      case "openvpn":
        return vpnTools.openvpn_available;
      case "ikev2":
        return vpnTools.ikev2_available;
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

  const handleConnect = async () => {
    if (!selectedServer) return;
    if (!isCurrentProtocolAvailable) {
      setError(
        `${protocol === "wireguard" ? "WireGuard" : protocol === "openvpn" ? "OpenVPN" : "IKEv2"} is not installed`
      );
      return;
    }
    if (protocol === "ikev2") {
      setError(
        "IKEv2/IPsec uses native OS features. Please configure via System Settings."
      );
      return;
    }

    setError(null);
    setStatus("connecting");
    setConfig(null);

    try {
      const result = await registerDevice({
        name: `Desktop • ${selectedServer.region}`,
        serverId: selectedServer.id,
      });

      let cfg: string;
      if (protocol === "wireguard") {
        cfg = buildWireGuardConfig({
          privateKey: result.privateKey,
          assignedIp: result.assignedIp,
          serverPublicKeyOverride: wgServerPublicKey || undefined,
        });
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
      } catch (e) {
        logError("Failed to apply VPN config via Tauri", e);
        setError(
          "Config generated, but failed to apply VPN settings locally. You may need to import it manually."
        );
      }
      setStatus("connected");
    } catch (e: any) {
      setStatus("disconnected");
      setError(e.message ?? "Failed to connect");
    }
  };

  const handleDisconnect = useCallback(() => {
    setConfig(null);
    setStatus("disconnected");
    void disconnectVpn(protocol).catch((e) =>
      logError("Failed to disconnect VPN via Tauri", e)
    );
  }, [protocol]);

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
    ]
  );

  // Show loading screen while checking auth
  if (authLoading) {
    return <LoadingScreen />;
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
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
        />
      </div>
    );
  }

  // Main view
  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-50">
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
          />

          <StatusPanel
            protocol={protocol}
            hasConfig={config !== null}
            error={error}
          />
        </main>
      </div>
    </div>
  );
}
