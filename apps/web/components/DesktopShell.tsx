"use client";

import { Shield, Download } from "lucide-react";

// DesktopShell is now a placeholder - the actual desktop UI lives in the native Tauri app
export default function DesktopShell() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-950 px-6 text-slate-50">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600">
          <Shield className="h-10 w-10 text-white" />
        </div>

        <h1 className="text-2xl font-bold">vpnVPN Desktop</h1>
        <p className="mt-3 text-slate-400">
          For the best experience, please use the native vpnVPN Desktop
          application.
        </p>

        <div className="mt-8 space-y-3">
          <a
            href="/downloads"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-semibold text-white transition-all hover:from-emerald-400 hover:to-teal-400"
          >
            <Download className="h-4 w-4" />
            Download Desktop App
          </a>

          <a
            href="/dashboard"
            className="block w-full rounded-lg border border-slate-700 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
          >
            Go to Web Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
