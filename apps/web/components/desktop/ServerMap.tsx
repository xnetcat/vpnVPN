"use client";

import { Shield } from "lucide-react";
import type { MapServer } from "./types";
import { positionForServer } from "./utils";

type ServerMapProps = {
  servers: MapServer[];
  selectedServer: MapServer | null;
  userCountry: string | null;
  onSelectServer: (id: string) => void;
};

export function ServerMap({
  servers,
  selectedServer,
  userCountry,
  onSelectServer,
}: ServerMapProps) {
  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Map Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900" />

      {/* Map Container */}
      <div className="absolute inset-4 rounded-2xl border border-slate-800/60 bg-slate-900/40 shadow-inner">
        {/* Decorative gradients */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-blue-500/20 blur-3xl" />
        </div>

        {/* Server Pins */}
        {servers.map((s) => {
          const pos = positionForServer(s, userCountry);
          const isActive = selectedServer?.id === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectServer(s.id)}
              className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-125 ${
                isActive ? "scale-125" : ""
              }`}
              style={pos}
              title={`${s.country ?? "Unknown"} • ${s.region}`}
            >
              <div
                className={`h-3 w-3 rounded-full border-2 ${
                  isActive
                    ? "border-emerald-300 bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.6)]"
                    : "border-slate-400 bg-slate-300 hover:border-emerald-400 hover:bg-emerald-300"
                }`}
              />
              {isActive && (
                <div className="absolute -inset-2 animate-ping rounded-full border border-emerald-400/50" />
              )}
            </button>
          );
        })}

        {/* Empty state */}
        {servers.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Shield className="mx-auto h-12 w-12 text-slate-600" />
              <p className="mt-3 text-sm text-slate-500">No servers available</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

