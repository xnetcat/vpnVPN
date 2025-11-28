"use client";

import {
  ChevronLeft,
  Check,
  X,
  Info,
  Wrench,
  Sliders,
  Shield,
} from "lucide-react";
import type { SettingsTab, Protocol, VpnToolsStatus } from "./types";

type SettingsViewProps = {
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
  protocol: Protocol;
  setProtocol: (p: Protocol) => void;
  autoConnect: boolean;
  setAutoConnect: (b: boolean) => void;
  wgQuickPath: string;
  setWgQuickPath: (s: string) => void;
  openvpnPath: string;
  setOpenvpnPath: (s: string) => void;
  wireguardCliPath: string;
  setWireguardCliPath: (s: string) => void;
  vpnTools: VpnToolsStatus | null;
  onBack: () => void;
};

const PROTOCOL_OPTIONS = [
  {
    id: "wireguard" as const,
    label: "WireGuard",
    desc: "Fast, modern, and secure",
  },
  {
    id: "openvpn" as const,
    label: "OpenVPN",
    desc: "Widely compatible",
  },
  {
    id: "ikev2" as const,
    label: "IKEv2 / IPsec",
    desc: "Native OS support",
  },
];

function GeneralTab({
  protocol,
  setProtocol,
  autoConnect,
  setAutoConnect,
  vpnTools,
}: {
  protocol: Protocol;
  setProtocol: (p: Protocol) => void;
  autoConnect: boolean;
  setAutoConnect: (b: boolean) => void;
  vpnTools: VpnToolsStatus | null;
}) {
  const isProtocolAvailable = (id: Protocol): boolean => {
    if (!vpnTools) return true;
    switch (id) {
      case "wireguard":
        return vpnTools.wireguard_available;
      case "openvpn":
        return vpnTools.openvpn_available;
      case "ikev2":
        return vpnTools.ikev2_available;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          VPN Protocol
        </h2>
        <div className="space-y-2">
          {PROTOCOL_OPTIONS.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors ${
                protocol === p.id
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="protocol"
                  value={p.id}
                  checked={protocol === p.id}
                  onChange={() => setProtocol(p.id)}
                  className="h-4 w-4 border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                />
                <div>
                  <div className="text-sm font-medium text-slate-100">
                    {p.label}
                  </div>
                  <div className="text-xs text-slate-500">{p.desc}</div>
                </div>
              </div>
              {vpnTools && (
                <div className="flex items-center gap-1.5">
                  {isProtocolAvailable(p.id) ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs text-emerald-400">Available</span>
                    </>
                  ) : (
                    <>
                      <X className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-xs text-red-400">Not found</span>
                    </>
                  )}
                </div>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-800 pt-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Startup
        </h2>
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 p-4">
          <div>
            <div className="text-sm font-medium text-slate-100">
              Auto-connect on launch
            </div>
            <div className="text-xs text-slate-500">
              Automatically connect to the last server when the app starts
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoConnect}
            onClick={() => setAutoConnect(!autoConnect)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
              autoConnect ? "bg-emerald-500" : "bg-slate-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                autoConnect ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </label>
      </div>
    </div>
  );
}

function ConnectionTab({
  wgQuickPath,
  setWgQuickPath,
  openvpnPath,
  setOpenvpnPath,
  wireguardCliPath,
  setWireguardCliPath,
  vpnTools,
}: {
  wgQuickPath: string;
  setWgQuickPath: (s: string) => void;
  openvpnPath: string;
  setOpenvpnPath: (s: string) => void;
  wireguardCliPath: string;
  setWireguardCliPath: (s: string) => void;
  vpnTools: VpnToolsStatus | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          VPN Tool Paths
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Configure custom paths for VPN executables. Leave empty to use system
          defaults.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              WireGuard (wg-quick)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={wgQuickPath}
                onChange={(e) => setWgQuickPath(e.target.value)}
                placeholder="wg-quick (auto-detect)"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {vpnTools?.wireguard_available ? (
                <div className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                </div>
              ) : (
                <div className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1.5">
                  <X className="h-3.5 w-3.5 text-red-400" />
                </div>
              )}
            </div>
            {vpnTools?.wireguard_path && (
              <p className="mt-1 text-xs text-slate-500">
                Detected: {vpnTools.wireguard_path}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              OpenVPN
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={openvpnPath}
                onChange={(e) => setOpenvpnPath(e.target.value)}
                placeholder="openvpn (auto-detect)"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {vpnTools?.openvpn_available ? (
                <div className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                </div>
              ) : (
                <div className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1.5">
                  <X className="h-3.5 w-3.5 text-red-400" />
                </div>
              )}
            </div>
            {vpnTools?.openvpn_path && (
              <p className="mt-1 text-xs text-slate-500">
                Detected: {vpnTools.openvpn_path}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              WireGuard CLI (Windows)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={wireguardCliPath}
                onChange={(e) => setWireguardCliPath(e.target.value)}
                placeholder="wireguard.exe (auto-detect)"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 pt-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          IKEv2 / IPsec
        </h2>
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="text-xs text-slate-400">
              <p>
                IKEv2/IPsec uses your operating system&apos;s native VPN
                capabilities.
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>
                  <strong>macOS:</strong> Uses System Preferences (networksetup)
                </li>
                <li>
                  <strong>Linux:</strong> Requires strongSwan or NetworkManager
                </li>
                <li>
                  <strong>Windows:</strong> Uses built-in VPN (rasdial)
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600">
          <Shield className="h-8 w-8 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-100">
            vpnVPN Desktop
          </h2>
          <p className="text-sm text-slate-400">Version 1.0.0</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
        <p className="text-sm text-slate-300">
          Secure, private VPN connection for your desktop. Your private keys
          never leave your device.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Features
        </h3>
        <ul className="space-y-2 text-sm text-slate-300">
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            WireGuard, OpenVPN, and IKEv2 support
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            Local key generation (zero-knowledge)
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            Auto-connect on startup
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            Cross-platform (macOS, Windows, Linux)
          </li>
        </ul>
      </div>

      <div className="border-t border-slate-800 pt-6">
        <p className="text-xs text-slate-500">
          Built with Tauri, React, and Next.js.
          <br />
          No logging. No tracking. Your privacy matters.
        </p>
      </div>
    </div>
  );
}

export function SettingsView({
  activeTab,
  setActiveTab,
  protocol,
  setProtocol,
  autoConnect,
  setAutoConnect,
  wgQuickPath,
  setWgQuickPath,
  openvpnPath,
  setOpenvpnPath,
  wireguardCliPath,
  setWireguardCliPath,
  vpnTools,
  onBack,
}: SettingsViewProps) {
  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Sliders className="h-4 w-4" /> },
    {
      id: "connection",
      label: "Connection",
      icon: <Wrench className="h-4 w-4" />,
    },
    { id: "about", label: "About", icon: <Info className="h-4 w-4" /> },
  ];

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {/* Settings Header */}
      <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-slate-100">Settings</h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Tabs Sidebar */}
        <nav className="w-48 border-r border-slate-800 bg-slate-900/50 p-3">
          <ul className="space-y-1">
            {tabs.map((tab) => (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    activeTab === tab.id
                      ? "bg-slate-800 text-slate-100"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "general" && (
            <GeneralTab
              protocol={protocol}
              setProtocol={setProtocol}
              autoConnect={autoConnect}
              setAutoConnect={setAutoConnect}
              vpnTools={vpnTools}
            />
          )}
          {activeTab === "connection" && (
            <ConnectionTab
              wgQuickPath={wgQuickPath}
              setWgQuickPath={setWgQuickPath}
              openvpnPath={openvpnPath}
              setOpenvpnPath={setOpenvpnPath}
              wireguardCliPath={wireguardCliPath}
              setWireguardCliPath={setWireguardCliPath}
              vpnTools={vpnTools}
            />
          )}
          {activeTab === "about" && <AboutTab />}
        </div>
      </div>
    </div>
  );
}

