import type { Protocol, ViewState } from "../lib/types";

function getProtocolLabel(protocol: Protocol): string {
  switch (protocol) {
    case "wireguard":
      return "WireGuard";
    case "openvpn":
      return "OpenVPN";
    case "ikev2":
      return "IKEv2 / IPsec";
  }
}

type StatusPanelProps = {
  protocol: Protocol;
  hasConfig: boolean;
  status: ViewState;
  errorMessage?: string | null;
};

export function StatusPanel({
  protocol,
  hasConfig,
  status,
  errorMessage,
}: StatusPanelProps) {
  const hasError = Boolean(errorMessage);

  return (
    <div className="border-t border-slate-800 bg-slate-900/60 px-6 py-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-slate-300">
            Protocol: {getProtocolLabel(protocol)}
          </h3>
          {hasError ? (
            <div className="mt-2 space-y-1 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="text-xs font-semibold text-red-300">
                Connection failed
              </p>
              <pre className="whitespace-pre-wrap break-words text-[11px] text-red-200">
                {errorMessage}
              </pre>
            </div>
          ) : hasConfig ? (
            <p className="mt-1 text-xs text-emerald-400">
              {status === "connected"
                ? "Configuration applied"
                : "Configuration generated, applying..."}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Click Connect to generate VPN configuration
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
