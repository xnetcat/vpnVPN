"use client";

import type { MapServer, ViewState } from "./types";

type ConnectionBarProps = {
  selectedServer: MapServer | null;
  status: ViewState;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function ConnectionBar({
  selectedServer,
  status,
  onConnect,
  onDisconnect,
}: ConnectionBarProps) {
  const isConnecting = status === "connecting";

  return (
    <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-6 py-4">
      <div>
        {selectedServer ? (
          <>
            <div className="text-lg font-semibold text-slate-100">
              {selectedServer.country ?? "Unknown"} • {selectedServer.region}
            </div>
            <div className="text-sm text-slate-400">
              {selectedServer.sessions} active sessions • {selectedServer.status}
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
        disabled={!selectedServer || isConnecting}
        className={`rounded-full px-8 py-2.5 text-sm font-semibold shadow-lg transition-all ${
          status === "connected"
            ? "bg-slate-700 text-slate-100 hover:bg-slate-600"
            : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400 disabled:from-slate-600 disabled:to-slate-600 disabled:text-slate-400"
        }`}
      >
        {status === "connected"
          ? "Disconnect"
          : isConnecting
            ? "Connecting..."
            : "Connect"}
      </button>
    </div>
  );
}

