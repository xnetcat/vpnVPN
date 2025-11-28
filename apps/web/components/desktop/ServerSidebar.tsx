"use client";

import type { MapServer } from "./types";

type ServerSidebarProps = {
  servers: MapServer[];
  selectedServer: MapServer | null;
  onSelectServer: (id: string) => void;
};

export function ServerSidebar({
  servers,
  selectedServer,
  onSelectServer,
}: ServerSidebarProps) {
  const handleSearch = (term: string) => {
    const lowerTerm = term.toLowerCase();
    const found =
      servers.find(
        (s) =>
          s.country?.toLowerCase().includes(lowerTerm) ||
          s.region.toLowerCase().includes(lowerTerm)
      ) ?? null;
    if (found) onSelectServer(found.id);
  };

  return (
    <aside className="hidden w-72 flex-col border-r border-slate-800 bg-slate-900/80 md:flex">
      <div className="border-b border-slate-800 px-4 py-3">
        <input
          type="search"
          placeholder="Search country or region..."
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Servers
        </h2>
        <ul className="space-y-1">
          {servers.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelectServer(s.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                  selectedServer?.id === s.id
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "text-slate-300 hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      s.status === "online" ? "bg-emerald-400" : "bg-slate-500"
                    }`}
                  />
                  <span className="text-sm font-medium">
                    {s.country ?? "Unknown"} • {s.region}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {s.sessions} sessions
                </span>
              </button>
            </li>
          ))}
          {servers.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-slate-500">
              No servers available.
              <br />
              Check your subscription.
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}

