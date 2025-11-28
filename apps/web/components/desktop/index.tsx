"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  buildWireGuardConfig,
  buildOpenVpnConfig,
  buildIkev2Config,
} from "@/lib/desktopConfig";

import type { ViewState, AppView, SettingsTab, MapServer } from "./types";
import { isDesktopShell, applyVpnConfig, disconnectVpn, log, logError } from "./utils";
import {
  useUserCountry,
  useVpnTools,
  useDesktopSettings,
  useDeepLinks,
  useSignOut,
} from "./hooks";
import { DesktopHeader } from "./DesktopHeader";
import { SettingsView } from "./SettingsView";
import { ServerSidebar } from "./ServerSidebar";
import { ServerMap } from "./ServerMap";
import { ConnectionBar } from "./ConnectionBar";
import { StatusPanel } from "./StatusPanel";

export default function DesktopShell() {
  // View state
  const [appView, setAppView] = useState<AppView>("main");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");

  // VPN connection state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<ViewState>("disconnected");
  const [config, setConfig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAttemptedAutoConnect, setHasAttemptedAutoConnect] = useState(false);
  const [wgServerPublicKey, setWgServerPublicKey] = useState<string>("");

  // Custom hooks
  const userCountry = useUserCountry();
  const vpnTools = useVpnTools();
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
  const handleSignOut = useSignOut();

  // Initialize deep links
  useDeepLinks();

  // tRPC queries
  const serversQuery = trpc.servers.list.useQuery();
  const utils = trpc.useUtils();

  // Discover vpn-node WireGuard public key
  const pubkeyQuery = trpc.desktop.serverPubkey.useQuery(undefined, {
    enabled:
      !process.env.NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY && !wgServerPublicKey,
    refetchOnWindowFocus: false,
  });

  const servers: MapServer[] = useMemo(
    () => serversQuery.data ?? [],
    [serversQuery.data]
  );

  const selectedServer =
    servers.find((s) => s.id === selectedId) ?? servers[0] ?? null;

  const deviceMutation = trpc.device.register.useMutation({
    onSuccess: async () => {
      await utils.device.list.invalidate();
    },
  });

  // Log component mount
  useEffect(() => {
    log("DesktopShell mounted");
    log("isDesktopShell:", isDesktopShell());
    return () => log("DesktopShell unmounted");
  }, []);

  // Set WireGuard public key from env or query
  useEffect(() => {
    if (wgServerPublicKey) return;
    const envPk = process.env.NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY;
    if (envPk) {
      setWgServerPublicKey(envPk);
      return;
    }
    if (pubkeyQuery.data?.publicKey) {
      setWgServerPublicKey(pubkeyQuery.data.publicKey);
    }
  }, [wgServerPublicKey, pubkeyQuery.data?.publicKey]);

  // Auto-connect on launch
  useEffect(() => {
    if (
      !autoConnect ||
      hasAttemptedAutoConnect ||
      !selectedServer ||
      status !== "disconnected"
    ) {
      return;
    }
    setHasAttemptedAutoConnect(true);
    void handleConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, hasAttemptedAutoConnect, selectedServer, status]);

  const handleConnect = async () => {
    if (!selectedServer) return;
    setError(null);
    setStatus("connecting");
    setConfig(null);

    try {
      const result = await deviceMutation.mutateAsync({
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

      <div className="flex flex-1 overflow-hidden">
        <ServerSidebar
          servers={servers}
          selectedServer={selectedServer}
          onSelectServer={handleSelectServer}
        />

        <main className="flex flex-1 flex-col">
          <ConnectionBar
            selectedServer={selectedServer}
            status={status}
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

