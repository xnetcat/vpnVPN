import { AlertTriangle } from "lucide-react";
import type { MapServer, ViewState, Protocol, VpnToolsStatus } from "../lib/types";

type ConnectionBarProps = {
  selectedServer: MapServer | null;
  status: ViewState;
  protocol: Protocol;
  vpnTools: VpnToolsStatus | null;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function ConnectionBar({
  selectedServer,
  status,
  protocol,
  vpnTools,
  onConnect,
  onDisconnect,
}: ConnectionBarProps) {
  const isConnecting = status === "connecting";

  // Check if the selected protocol's tool is available
  const isToolAvailable = (): boolean => {
    if (!vpnTools) return false;
    switch (protocol) {
      case "wireguard":
        return vpnTools.wireguard_available;
      case "openvpn":
        return vpnTools.openvpn_available;
      case "ikev2":
        return vpnTools.ikev2_available;
    }
  };

  // Check if any VPN tool is available
  const hasAnyTool = vpnTools
    ? vpnTools.wireguard_available ||
      vpnTools.openvpn_available ||
      vpnTools.ikev2_available
    : false;

  // IKEv2 uses native OS features - we don't support auto-connection for it
  const isNativeProtocol = protocol === "ikev2";

  // Determine if connect should be disabled
  const toolAvailable = isToolAvailable();
  const canConnect =
    selectedServer && !isConnecting && toolAvailable && !isNativeProtocol;

  // Get warning message
  const getWarningMessage = (): string | null => {
    if (!vpnTools) return null;
    if (!hasAnyTool) {
      return "No VPN tools installed. Please install WireGuard or OpenVPN.";
    }
    if (isNativeProtocol) {
      return "IKEv2/IPsec uses native OS features. Configure via System Settings.";
    }
    if (!toolAvailable) {
      return `${protocol === "wireguard" ? "WireGuard" : "OpenVPN"} is not installed. Please install it or select a different protocol.`;
    }
    return null;
  };

  const warningMessage = getWarningMessage();

  return (
    <div className="border-b border-slate-800 bg-slate-900/60">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          {selectedServer ? (
            <>
              <div className="text-lg font-semibold text-slate-100">
                {selectedServer.country ?? "Unknown"} • {selectedServer.region}
              </div>
              <div className="text-sm text-slate-400">
                {selectedServer.sessions} active sessions •{" "}
                {selectedServer.status}
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">
              Select a server to connect
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={status === "connected" ? onDisconnect : onConnect}
          disabled={!canConnect && status !== "connected"}
          className={`rounded-full px-8 py-2.5 text-sm font-semibold shadow-lg transition-all ${
            status === "connected"
              ? "bg-slate-700 text-slate-100 hover:bg-slate-600"
              : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-600 disabled:text-slate-400"
          }`}
        >
          {status === "connected"
            ? "Disconnect"
            : isConnecting
              ? "Connecting..."
              : "Connect"}
        </button>
      </div>

      {/* Warning banner */}
      {warningMessage && status !== "connected" && (
        <div className="flex items-center gap-2 border-t border-amber-500/20 bg-amber-500/10 px-6 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="text-xs text-amber-300">{warningMessage}</span>
        </div>
      )}
    </div>
  );
}

