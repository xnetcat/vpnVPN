"use client";

import { getProtocolLabel } from "./utils";
import type { Protocol } from "./types";

type StatusPanelProps = {
  protocol: Protocol;
  hasConfig: boolean;
  error: string | null;
};

export function StatusPanel({ protocol, hasConfig, error }: StatusPanelProps) {
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

        {error && (
          <div className="max-w-sm rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

