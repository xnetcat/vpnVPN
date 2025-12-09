import Link from "next/link";
import { getSession } from "@/lib/auth";

// Desktop download URLs from environment
const DESKTOP_BUCKET_URL =
  process.env.DESKTOP_BUCKET_URL ?? process.env.NEXT_PUBLIC_DESKTOP_BUCKET_URL;
const ENVIRONMENT = process.env.ENVIRONMENT ?? "staging";
const DESKTOP_BASE = DESKTOP_BUCKET_URL
  ? `${DESKTOP_BUCKET_URL}/releases/${ENVIRONMENT}`
  : null;

type DesktopDownloads = {
  macos: string | null;
  windows: string | null;
  linux: string | null;
};

function getDesktopDownloads(): DesktopDownloads {
  if (!DESKTOP_BASE) {
    return { macos: null, windows: null, linux: null };
  }
  return {
    macos: `${DESKTOP_BASE}/vpnvpn-desktop-latest.dmg`,
    windows: `${DESKTOP_BASE}/vpnvpn-desktop-latest.exe`,
    linux: `${DESKTOP_BASE}/vpnvpn-desktop-latest.AppImage`,
  };
}

type FleetMetrics = {
  totalServers: number;
  onlineServers: number;
  totalSessions: number;
  avgCpu: number | null;
  samples: { region: string; status: string; sessions: number }[];
};

async function fetchFleetMetrics(): Promise<FleetMetrics | null> {
  const base =
    process.env.CONTROL_PLANE_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  const apiKey = process.env.CONTROL_PLANE_API_KEY;

  if (!base || !apiKey) return null;

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/servers`, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) return null;

    const totalServers = data.length;
    const onlineServers = data.filter(
      (s) => (s.status ?? "unknown").toLowerCase() === "online",
    ).length;

    let totalSessions = 0;
    let cpuSum = 0;
    let cpuCount = 0;

    for (const s of data) {
      const sessions =
        typeof s.metrics?.sessions === "number"
          ? s.metrics.sessions
          : typeof s.activeSessions === "number"
            ? s.activeSessions
            : 0;
      totalSessions += sessions;
      if (typeof s.metrics?.cpu === "number") {
        cpuSum += s.metrics.cpu;
        cpuCount += 1;
      }
    }

    const samples = data.slice(0, 3).map((s) => ({
      region: s.region ?? s.metadata?.region ?? "unknown",
      status: s.status ?? "unknown",
      sessions:
        typeof s.metrics?.sessions === "number"
          ? s.metrics.sessions
          : typeof s.activeSessions === "number"
            ? s.activeSessions
            : 0,
    }));

    return {
      totalServers,
      onlineServers,
      totalSessions,
      avgCpu: cpuCount ? cpuSum / cpuCount : null,
      samples,
    };
  } catch (err) {
    console.error("[landing] failed to fetch fleet metrics", err);
    return null;
  }
}

export default async function HomePage() {
  const session = await getSession();
  const isAuthed = Boolean((session?.user as any)?.id);
  const metrics = await fetchFleetMetrics();
  const downloads = getDesktopDownloads();

  const onlineServers = metrics?.onlineServers ?? null;
  const totalServers = metrics?.totalServers ?? null;
  const totalSessions = metrics?.totalSessions ?? null;
  const avgCpu = metrics?.avgCpu ?? null;
  const hasDownloads = downloads.macos || downloads.windows || downloads.linux;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pt-16">
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            vpnVPN • Self‑hosted control plane + real VPN network
          </div>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Production‑grade VPN as a product,{" "}
            <span className="text-emerald-600">not a side project.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
            vpnVPN gives you a full SaaS VPN stack — web dashboard, billing,
            multi‑node control plane, metrics, and desktop app — all backed by a
            real WireGuard/OpenVPN/IKEv2 server you control.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {isAuthed ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/register"
                  className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
                >
                  Get started from $10/mo
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                >
                  View pricing
                </Link>
              </>
            )}
            <p className="text-xs text-slate-500">
              No traffic logs. Cancel anytime.
            </p>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4 text-sm text-slate-600 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Protocols
              </dt>
              <dd className="mt-1 font-medium">WireGuard, OpenVPN, IKEv2</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Multi‑node
              </dt>
              <dd className="mt-1 font-medium">Regions &amp; load aware</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                Clients
              </dt>
              <dd className="mt-1 font-medium">
                Web, desktop, WireGuard, OpenVPN
              </dd>
            </div>
          </dl>
        </div>

        {/* Simple "screenshot" / preview card */}
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-gradient-to-tr from-emerald-100 via-transparent to-sky-100 opacity-80 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
              <span className="text-xs font-medium text-slate-500">
                vpnVPN • Server fleet
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                Live metrics
              </span>
            </div>
            <div className="px-4 py-3">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">
                    Online servers
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {onlineServers ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {totalServers !== null
                      ? `of ${totalServers} total`
                      : "live from control plane"}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">
                    Active sessions
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {totalSessions ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    current across all nodes
                  </div>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[11px] text-slate-500">
                    Avg. CPU / node
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {avgCpu !== null ? `${Math.round(avgCpu)}%` : "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    based on reported node metrics
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Region</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-right">Sessions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {metrics?.samples?.length ? (
                      metrics.samples.map((s) => (
                        <tr key={s.region + s.status}>
                          <td className="px-3 py-1.5 text-slate-800">
                            {s.region}
                          </td>
                          <td className="px-3 py-1.5 text-slate-800">
                            {s.status}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-800">
                            {s.sessions}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          className="px-3 py-2 text-center text-slate-500"
                          colSpan={3}
                        >
                          No servers registered yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mt-16 space-y-8">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold text-slate-900">
            Everything you need to run a serious VPN service.
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            vpnVPN ships with a full control plane, billing, metrics, and
            clients. You bring the servers (or run ours), we handle the rest.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              SaaS dashboard
            </h3>
            <p className="mt-2 text-xs text-slate-600">
              Next.js dashboard for users and admins: subscriptions, devices,
              multi‑node server fleet, and live VPN metrics.
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Real VPN</h3>
            <p className="mt-2 text-xs text-slate-600">
              Rust VPN node with WireGuard, OpenVPN, and IKEv2 backends. No mock
              tunnels — real interfaces, real encryption.
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              Desktop app
            </h3>
            <p className="mt-2 text-xs text-slate-600">
              Tauri desktop shell that wraps the `/desktop` experience and can
              launch native WireGuard/OpenVPN clients on macOS, Windows, Linux.
            </p>
          </div>
        </div>
      </section>

      {/* Desktop Downloads */}
      {hasDownloads && (
        <section className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-slate-900">
              Download vpnVPN Desktop
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Get the native desktop app for one-click VPN connections.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {downloads.macos && (
              <a
                href={downloads.macos}
                className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <svg
                  className="h-12 w-12 text-slate-700"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                <span className="mt-3 text-sm font-medium text-slate-900">
                  macOS
                </span>
                <span className="mt-1 text-xs text-slate-500">.dmg</span>
              </a>
            )}

            {downloads.windows && (
              <a
                href={downloads.windows}
                className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <svg
                  className="h-12 w-12 text-slate-700"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M3 12V6.75l6-1.32v6.48L3 12zm17-9v8.75l-10 .15V5.21L20 3zM3 13l6 .1v6.39l-6-1.26V13zm17 .25V22l-10-1.91V13.1l10 .15z" />
                </svg>
                <span className="mt-3 text-sm font-medium text-slate-900">
                  Windows
                </span>
                <span className="mt-1 text-xs text-slate-500">.exe</span>
              </a>
            )}

            {downloads.linux && (
              <a
                href={downloads.linux}
                className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <svg
                  className="h-12 w-12 text-slate-700"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.002c-.06-.135-.12-.2-.18-.264-.14-.135-.276-.334-.43-.467-.26-.199-.457-.332-.512-.465-.03-.066-.05-.132-.085-.2.08.2.135.464.19.664.053.2.085.265.12.331.18.335.262.4.382.6l.004-.003c.11.135.163.198.245.467a1.09 1.09 0 01.016.667c-.038.135-.1.267-.177.4-.075.135-.164.264-.264.466l-.004.002c-.06.135-.068.2-.06.265a.559.559 0 01-.058.265v.004c-.296.535-.936.8-1.6.8-.452 0-.921-.135-1.25-.267-.144-.059-.276-.135-.4-.2a1.395 1.395 0 00-.434-.135 6.997 6.997 0 01-.766-.135 2.26 2.26 0 01-.618-.2v.002a.77.77 0 01-.283-.267c-.083-.135-.14-.2-.235-.334a.677.677 0 01-.126-.471v-.002h.003a1.087 1.087 0 01.07-.399c.035-.133.082-.265.144-.398l.003-.002c.168-.4.267-.733.168-1.001-.1-.27-.332-.333-.646-.534a.682.682 0 01-.116-.068c-.238-.133-.438-.267-.604-.467-.069-.066-.143-.133-.231-.133h-.012c-.088.003-.166.036-.237.132a.59.59 0 00-.148.465v.002c.022.2.11.4.24.533.106.135.236.201.367.335h-.003a1.14 1.14 0 01-.2.4c-.09.134-.197.27-.322.4-.126.135-.268.266-.42.399l-.003.002a4.092 4.092 0 00-.436.398c-.052.066-.066.131-.066.198a.48.48 0 00.055.2v.003c.046.098.106.131.164.199.123.132.198.265.254.398.058.134.09.2.09.267 0 .066-.035.133-.106.199l-.003.004c-.165.132-.392.2-.682.2-.152 0-.32-.024-.494-.063a5.003 5.003 0 01-.95-.266c-.315-.134-.616-.333-.867-.667-.252-.332-.398-.732-.43-1.198a3.078 3.078 0 01.148-1.133v-.004h-.004a2.556 2.556 0 01.33-.666c.106-.133.229-.267.363-.4.218-.2.47-.4.751-.533.14-.067.29-.067.445-.067l.067.003h.04c.066 0 .134.002.195-.065.068-.067.105-.2.102-.397v-.004c-.01-.135-.034-.2-.067-.266-.037-.07-.077-.133-.129-.2a1.114 1.114 0 00-.161-.198c-.04-.033-.08-.066-.118-.1l-.022-.016-.004-.003a12.917 12.917 0 00-.536-.4c-.228-.135-.444-.267-.645-.533-.204-.27-.36-.602-.436-1.002-.073-.397-.05-.864.112-1.333.086-.254.211-.472.369-.667.157-.2.35-.367.544-.467.37-.2.786-.333 1.156-.333.385 0 .73.135 1.01.334.28.198.464.398.555.667l.005.013c.047-.2.088-.4.054-.4h.001c-.1-.135-.223-.263-.356-.397-.152-.135-.332-.267-.532-.4-.2-.135-.412-.265-.63-.398a5.188 5.188 0 00-.66-.332c-.223-.1-.446-.198-.645-.332a1.37 1.37 0 01-.427-.465v-.002h-.003c-.147-.332-.202-.667-.128-1.067.073-.4.222-.8.428-1.133.208-.333.473-.6.8-.8.327-.197.686-.267 1.074-.267.288 0 .569.053.836.135.07.021.138.045.206.067v.003c.117-.065.234-.132.367-.132.133 0 .283.066.45.133.168.067.361.132.49.266l.001.002c.195.133.376.332.542.534.166.198.31.397.436.598.122.2.222.4.3.6.076.2.13.398.162.598l.005.063v-.003c.088.4.175.8.278 1.133.104.334.226.6.362.865l.009.017z" />
                </svg>
                <span className="mt-3 text-sm font-medium text-slate-900">
                  Linux
                </span>
                <span className="mt-1 text-xs text-slate-500">.AppImage</span>
              </a>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-900">
              📦 macOS Installation
            </h3>
            <p className="mt-2 text-xs text-amber-800 leading-relaxed">
              After downloading, you must remove the quarantine attribute (macOS
              adds this to all downloaded apps):
            </p>
            <div className="mt-3 rounded bg-amber-100 p-3">
              <p className="text-xs font-medium text-amber-900 mb-2">
                Quick fix (paste in Terminal):
              </p>
              <code className="block rounded bg-white px-2 py-1.5 text-[11px] text-slate-800 font-mono">
                xattr -cr &quot;/Applications/vpnVPN Desktop (Staging).app&quot;
                && open &quot;/Applications/vpnVPN Desktop (Staging).app&quot;
              </code>
            </div>
            <p className="mt-3 text-xs text-amber-700">
              <strong>Alternative:</strong> Right-click the app → select{" "}
              <strong>Open</strong> instead of double-clicking.
            </p>
            <p className="mt-2 text-xs text-amber-600">
              This is normal for all apps distributed outside the Mac App Store.
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            Requires macOS 10.15+, Windows 10+, or Linux (glibc 2.31+)
          </p>
        </section>
      )}

      {/* Callout */}
      <section className="mt-16 rounded-2xl border border-emerald-100 bg-emerald-50 px-6 py-6 sm:flex sm:items-center sm:justify-between sm:px-8">
        <div>
          <h3 className="text-sm font-semibold text-emerald-900">
            Ready when you are.
          </h3>
          <p className="mt-1 text-xs text-emerald-800">
            Start with a single node locally, then scale out to multiple
            regions. The same code runs on your laptop and in production.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 sm:mt-0 sm:items-center">
          {isAuthed ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md bg-emerald-900 px-4 py-2 text-xs font-medium text-emerald-50 shadow-sm hover:bg-emerald-800"
            >
              Open dashboard
            </Link>
          ) : (
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center rounded-md bg-emerald-900 px-4 py-2 text-xs font-medium text-emerald-50 shadow-sm hover:bg-emerald-800"
            >
              Create your account
            </Link>
          )}
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
          >
            See plans
          </Link>
        </div>
      </section>
    </main>
  );
}
