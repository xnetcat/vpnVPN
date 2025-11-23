"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  buildWireGuardConfig,
  buildOpenVpnConfig,
  buildIkev2Config,
} from "@/lib/desktopConfig";

type ViewState = "disconnected" | "connecting" | "connected";
type Protocol = "wireguard" | "openvpn" | "ikev2";

type MapServer = {
  id: string;
  region: string;
  country?: string;
  status: string;
  sessions: number;
};

// Deterministically place a server "pin" on the map using a hash of its id.
function positionForServer(id: string): { top: string; left: string } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const top = 10 + (hash % 70); // 10–80%
  const left = 10 + ((hash >> 8) % 80); // 10–90%
  return { top: `${top}%`, left: `${left}%` };
}

function isDesktopShell(): boolean {
  if (typeof window === "undefined") return false;
  const anyWin = window as any;
  return Boolean(anyWin.__TAURI__?.core?.invoke);
}

async function applyVpnConfig(
  protocol: Protocol,
  config: string,
): Promise<void> {
  if (!isDesktopShell()) return;
  const anyWin = window as any;
  await anyWin.__TAURI__.core.invoke("apply_vpn_config", { protocol, config });
}

async function disconnectVpn(protocol: Protocol): Promise<void> {
  if (!isDesktopShell()) return;
  const anyWin = window as any;
  await anyWin.__TAURI__.core.invoke("disconnect_vpn", { protocol });
}

export default function DesktopShell() {
  const serversQuery = trpc.servers.list.useQuery();
  const utils = trpc.useUtils();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<ViewState>("disconnected");
  const [config, setConfig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<Protocol>("wireguard");
  const [autoConnect, setAutoConnect] = useState(false);
  const [hasAttemptedAutoConnect, setHasAttemptedAutoConnect] = useState(false);
  const [wgQuickPath, setWgQuickPath] = useState("");
  const [openvpnPath, setOpenvpnPath] = useState("");
  const [wireguardCliPath, setWireguardCliPath] = useState("");

  const servers: MapServer[] = useMemo(
    () => serversQuery.data ?? [],
    [serversQuery.data],
  );

  const selectedServer =
    servers.find((s) => s.id === selectedId) ?? servers[0] ?? null;

  const deviceMutation = trpc.device.register.useMutation({
    onSuccess: async () => {
      await utils.device.list.invalidate();
    },
  });

  // Hydrate protocol/auto-connect from local desktop settings file when running in Tauri
  useEffect(() => {
    if (!isDesktopShell()) return;
    const anyWin = window as any;

    (async () => {
      try {
        const s = (await anyWin.__TAURI__.core.invoke(
          "get_desktop_settings",
        )) as {
          preferred_protocol?: Protocol;
          auto_connect?: boolean;
          wg_quick_path?: string | null;
          openvpn_path?: string | null;
          wireguard_cli_path?: string | null;
        };

        if (s.preferred_protocol) {
          setProtocol(s.preferred_protocol);
        }
        if (typeof s.auto_connect === "boolean") {
          setAutoConnect(s.auto_connect);
        }
        setWgQuickPath(s.wg_quick_path ?? "");
        setOpenvpnPath(s.openvpn_path ?? "");
        setWireguardCliPath(s.wireguard_cli_path ?? "");
      } catch (e) {
        // Fallback to defaults if config file cannot be read.
        // eslint-disable-next-line no-console
        console.error("Failed to load desktop settings from file", e);
      }
    })();
  }, []);

  // Persist protocol / auto-connect / paths to local settings file when changed in Tauri
  useEffect(() => {
    if (!isDesktopShell()) return;
    const anyWin = window as any;
    void anyWin.__TAURI__.core
      .invoke("update_desktop_settings", {
        preferredProtocol: protocol,
        autoConnect,
        wgQuickPath,
        openvpnPath,
        wireguardCliPath,
      })
      .catch((e: unknown) =>
        // eslint-disable-next-line no-console
        console.error("Failed to update desktop settings file", e),
      );
  }, [protocol, autoConnect, wgQuickPath, openvpnPath, wireguardCliPath]);

  // Auto-connect once if enabled and we have a selected server
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
        console.error("Failed to apply VPN config via Tauri", e);
        setError(
          "Config generated, but failed to apply VPN settings locally. You may need to import it manually.",
        );
      }
      setStatus("connected");
    } catch (e: any) {
      setStatus("disconnected");
      setError(e.message ?? "Failed to connect");
    }
  };

  const handleDisconnect = () => {
    setConfig(null);
    setStatus("disconnected");
    void disconnectVpn(protocol).catch((e) =>
      console.error("Failed to disconnect VPN via Tauri", e),
    );
  };

  const isConnecting = status === "connecting";

  const protocolLabel =
    protocol === "wireguard"
      ? "WireGuard"
      : protocol === "openvpn"
        ? "OpenVPN"
        : "IKEv2 / IPsec";

  return (
    <main className="flex min-h-[calc(100vh-65px)] bg-slate-950 text-slate-50">
      {/* Sidebar */}
      <aside className="hidden w-80 flex-col border-r border-slate-800 bg-slate-900/80 px-4 py-4 md:flex">
        <div className="mb-4 px-1">
          <h1 className="text-sm font-semibold tracking-wide text-slate-100">
            vpnVPN Desktop
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Choose a location and connect. Only a single VPN configuration is
            active per account.
          </p>
        </div>

        <div className="mb-3">
          <input
            type="search"
            placeholder="Search country or region…"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            onChange={(e) => {
              const term = e.target.value.toLowerCase();
              const found =
                servers.find(
                  (s) =>
                    s.country?.toLowerCase().includes(term) ||
                    s.region.toLowerCase().includes(term),
                ) ?? null;
              if (found) setSelectedId(found.id);
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Countries
          </h2>
          <ul className="space-y-1 text-sm">
            {servers.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left ${
                    selectedServer?.id === s.id
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800/80"
                  }`}
                >
                  <span className="truncate">
                    {s.country ?? "Unknown"} • {s.region}
                  </span>
                  <span className="ml-2 text-[10px] text-slate-400">
                    {s.sessions} sessions
                  </span>
                </button>
              </li>
            ))}
            {servers.length === 0 && (
              <li className="px-1 py-2 text-xs text-slate-500">
                No servers available. Check your subscription and control-plane
                configuration.
              </li>
            )}
          </ul>
        </div>

        <div className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500 space-y-2">
          <p>
            Signed in via your browser session. Billing and account settings
            live in the main dashboard.
          </p>
          {isDesktopShell() && (
            <p className="mt-1">
              If you are not signed in, you will be prompted to log in using the
              embedded browser before connecting.
            </p>
          )}
          {isDesktopShell() && (
            <div className="space-y-1 pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Executable paths
              </div>
              <label className="block text-[11px] text-slate-400">
                WireGuard (wg-quick)
                <input
                  type="text"
                  value={wgQuickPath}
                  onChange={(e) => setWgQuickPath(e.target.value)}
                  placeholder="wg-quick"
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                OpenVPN
                <input
                  type="text"
                  value={openvpnPath}
                  onChange={(e) => setOpenvpnPath(e.target.value)}
                  placeholder="openvpn / openvpn.exe"
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                WireGuard CLI (Windows)
                <input
                  type="text"
                  value={wireguardCliPath}
                  onChange={(e) => setWireguardCliPath(e.target.value)}
                  placeholder="wireguard.exe"
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </label>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <section className="flex flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Status
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  status === "connected"
                    ? "bg-emerald-400"
                    : status === "connecting"
                      ? "bg-amber-400"
                      : "bg-slate-600"
                }`}
              />
              <span className="text-sm font-medium">
                {status === "connected"
                  ? "Connected"
                  : status === "connecting"
                    ? "Connecting…"
                    : "Not connected"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {selectedServer && (
              <div className="text-right text-xs text-slate-400">
                <div className="font-medium text-slate-100">
                  {selectedServer.country ?? "Unknown"} •{" "}
                  {selectedServer.region}
                </div>
                <div>
                  {selectedServer.sessions} sessions • {selectedServer.status}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={
                status === "connected" ? handleDisconnect : handleConnect
              }
              disabled={!selectedServer || isConnecting}
              className={`rounded-full px-5 py-2 text-sm font-semibold shadow ${
                status === "connected"
                  ? "bg-slate-800 text-slate-50 hover:bg-slate-700"
                  : "bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:text-slate-200"
              }`}
            >
              {status === "connected"
                ? "Disconnect"
                : isConnecting
                  ? "Connecting…"
                  : "Connect"}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col lg:flex-row">
          {/* Map */}
          <div className="relative flex-1 border-b border-slate-800 bg-slate-950 lg:border-b-0 lg:border-r">
            <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950" />
            <div className="absolute inset-6 rounded-3xl border border-slate-800/60 bg-slate-900/40 shadow-inner">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,197,94,0.25),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(59,130,246,0.2),transparent_55%)]" />
              {servers.map((s) => {
                const pos = positionForServer(s.id);
                const isActive = selectedServer?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                      isActive
                        ? "border-emerald-300 bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.5)]"
                        : "border-slate-500 bg-slate-300/80 hover:bg-emerald-300"
                    }`}
                    style={pos}
                    title={`${s.country ?? "Unknown"} • ${s.region}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Config + logs */}
          <div className="flex w-full max-w-xl flex-col border-t border-slate-800 bg-slate-950 px-4 py-4 lg:border-t-0">
            <h2 className="mb-2 text-sm font-semibold text-slate-100">
              Current configuration ({protocolLabel})
            </h2>
            {config ? (
              <textarea
                readOnly
                className="h-48 w-full resize-none rounded-md border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-emerald-200"
                value={config}
              />
            ) : (
              <p className="mb-4 text-xs text-slate-400">
                Click{" "}
                <span className="font-semibold text-slate-100">Connect</span> to
                generate a VPN configuration for this device. Previous
                credentials are revoked automatically so only one active peer
                exists per account.
              </p>
            )}

            {error && (
              <div className="mt-2 rounded-md border border-red-500/60 bg-red-950 px-3 py-2 text-xs text-red-100">
                {error}
              </div>
            )}

            <div className="mt-4 space-y-2 text-[11px] text-slate-500">
              <p>
                The desktop client never sends your private key to the backend.
                Keys are generated locally; only the public key and allocated IP
                are registered with the control plane.
              </p>
              <p>
                Some protocols (for example IKEv2 / IPsec on certain platforms)
                may require you to import the generated configuration manually
                into your OS VPN settings. System tools like WireGuard and
                OpenVPN must be installed on this device for automatic
                connection management.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
