import { memo, useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { Shield } from "lucide-react";
import type { MapServer } from "../lib/types";
import { COUNTRY_COORDS, REGION_TO_COUNTRY } from "../lib/constants";

// TopoJSON world map (Natural Earth)
const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type ServerMapProps = {
  servers: MapServer[];
  selectedServer: MapServer | null;
  userCountry: string | null;
  onSelectServer: (id: string) => void;
};

// Get coordinates for a server
function getServerCoords(
  server: MapServer,
  userCountry: string | null
): [number, number] | null {
  // Try direct country code
  if (server.country && COUNTRY_COORDS[server.country]) {
    const coords = COUNTRY_COORDS[server.country];
    return [coords.lng, coords.lat];
  }

  // Try region mapping
  const countryFromRegion = REGION_TO_COUNTRY[server.region.toLowerCase()];
  if (countryFromRegion && COUNTRY_COORDS[countryFromRegion]) {
    const coords = COUNTRY_COORDS[countryFromRegion];
    return [coords.lng, coords.lat];
  }

  // For "local" servers, use user's country
  if (
    server.region.toLowerCase() === "local" &&
    userCountry &&
    COUNTRY_COORDS[userCountry]
  ) {
    const coords = COUNTRY_COORDS[userCountry];
    return [coords.lng, coords.lat];
  }

  // Default fallback
  return null;
}

// Memoized geography component to prevent re-renders
const WorldGeographies = memo(function WorldGeographies() {
  return (
    <Geographies geography={GEO_URL}>
      {({ geographies }) =>
        geographies.map((geo) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill="#1e293b"
            stroke="#334155"
            strokeWidth={0.5}
            style={{
              default: { outline: "none" },
              hover: { outline: "none", fill: "#334155" },
              pressed: { outline: "none" },
            }}
          />
        ))
      }
    </Geographies>
  );
});

export function ServerMap({
  servers,
  selectedServer,
  userCountry,
  onSelectServer,
}: ServerMapProps) {
  // Compute markers with coordinates
  const markers = useMemo(() => {
    return servers
      .map((server) => {
        const coords = getServerCoords(server, userCountry);
        if (!coords) return null;
        return { server, coords };
      })
      .filter(Boolean) as { server: MapServer; coords: [number, number] }[];
  }, [servers, userCountry]);

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Map Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900" />

      {/* Map Container */}
      <div className="absolute inset-4 overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/40 shadow-inner">
        {/* Decorative gradients */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl">
          <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        {servers.length > 0 ? (
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              scale: 130,
              center: [10, 30],
            }}
            className="h-full w-full"
          >
            <WorldGeographies />

            {/* Server markers */}
            {markers.map(({ server, coords }) => {
              const isActive = selectedServer?.id === server.id;
              return (
                <Marker key={server.id} coordinates={coords}>
                  <g
                    onClick={() => onSelectServer(server.id)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Pulse ring for active */}
                    {isActive && (
                      <circle
                        r={12}
                        fill="none"
                        stroke="#34d399"
                        strokeWidth={1}
                        opacity={0.5}
                        className="animate-ping"
                      />
                    )}
                    {/* Outer glow for active */}
                    {isActive && (
                      <circle r={8} fill="#10b981" fillOpacity={0.3} />
                    )}
                    {/* Main marker */}
                    <circle
                      r={isActive ? 6 : 4}
                      fill={isActive ? "#34d399" : "#94a3b8"}
                      stroke={isActive ? "#a7f3d0" : "#64748b"}
                      strokeWidth={2}
                      className="transition-all duration-200 hover:fill-emerald-400"
                    />
                  </g>
                </Marker>
              );
            })}
          </ComposableMap>
        ) : (
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

