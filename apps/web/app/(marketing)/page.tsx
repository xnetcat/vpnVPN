import Link from "next/link";
import { getSession } from "@/lib/auth";

type FleetMetrics = {
  totalServers: number;
  onlineServers: number;
  totalSessions: number;
  avgCpu: number | null;
  samples: { region: string; status: string; sessions: number }[];
};

async function fetchFleetMetrics(): Promise<FleetMetrics | null> {
  const base =
    process.env.CONTROL_PLANE_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
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

  const onlineServers = metrics?.onlineServers ?? null;
  const totalServers = metrics?.totalServers ?? null;
  const totalSessions = metrics?.totalSessions ?? null;
  const avgCpu = metrics?.avgCpu ?? null;

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
              <dd className="mt-1 font-medium">
                WireGuard, OpenVPN, IKEv2
              </dd>
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
                    {metrics?.samples?.length
                      ? metrics.samples.map((s) => (
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
                      : (
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
            vpnVPN ships with a full control plane, billing, metrics, and clients.
            You bring the servers (or run ours), we handle the rest.
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

      {/* Callout */}
      <section className="mt-16 rounded-2xl border border-emerald-100 bg-emerald-50 px-6 py-6 sm:flex sm:items-center sm:justify-between sm:px-8">
        <div>
          <h3 className="text-sm font-semibold text-emerald-900">
            Ready when you are.
          </h3>
          <p className="mt-1 text-xs text-emerald-800">
            Start with a single node locally, then scale out to multiple regions.
            The same code runs on your laptop and in production.
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
