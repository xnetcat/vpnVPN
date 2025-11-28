import type { Protocol } from "../lib/types";

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
};

export function StatusPanel({ protocol, hasConfig }: StatusPanelProps) {
  return (
    <div className="border-t border-slate-800 bg-slate-900/60 px-6 py-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-slate-300">
            Protocol: {getProtocolLabel(protocol)}
          </h3>
          {hasConfig ? (
            <p className="mt-1 text-xs text-emerald-400">
              Configuration generated and applied
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
