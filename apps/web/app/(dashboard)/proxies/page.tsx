import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";

export default async function ProxiesPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing"
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6 text-slate-50">
      <h1 className="mb-3 text-2xl font-semibold text-slate-50">Proxies</h1>
      <p className="text-sm text-slate-400">
        Proxy management is coming soon. Existing devices continue to use the
        standard VPN nodes while we finalize proxy support.
      </p>
      <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/80 p-6 shadow-sm shadow-slate-900/40">
        <h2 className="text-lg font-semibold text-slate-50">Placeholder</h2>
        <p className="mt-2 text-sm text-slate-300">
          We&apos;ll expose proxy pool details and selection controls here once
          available.
        </p>
      </div>
    </main>
  );
}
