"use client";

import { useEffect, useState, useCallback } from "react";
import type { Protocol, VpnToolsStatus } from "./types";
import { TIMEZONE_TO_COUNTRY } from "./constants";
import {
  isDesktopShell,
  detectVpnTools,
  getDesktopSettings,
  updateDesktopSettings,
  log,
  logError,
} from "./utils";

// Hook to detect user's country from timezone
export function useUserCountry(): string | null {
  const [userCountry, setUserCountry] = useState<string | null>(null);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const country = TIMEZONE_TO_COUNTRY[tz] ?? "US";
    setUserCountry(country);
    log("Detected user country from timezone:", country);
  }, []);

  return userCountry;
}

// Hook to detect VPN tools availability
export function useVpnTools(): VpnToolsStatus | null {
  const [vpnTools, setVpnTools] = useState<VpnToolsStatus | null>(null);

  useEffect(() => {
    if (!isDesktopShell()) return;

    (async () => {
      const tools = await detectVpnTools();
      if (tools) {
        setVpnTools(tools);
        log("Detected VPN tools:", tools);
      }
    })();
  }, []);

  return vpnTools;
}

// Hook to manage desktop settings with Tauri persistence
export function useDesktopSettings() {
  const [protocol, setProtocol] = useState<Protocol>("wireguard");
  const [autoConnect, setAutoConnect] = useState(false);
  const [wgQuickPath, setWgQuickPath] = useState("");
  const [openvpnPath, setOpenvpnPath] = useState("");
  const [wireguardCliPath, setWireguardCliPath] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from Tauri on mount
  useEffect(() => {
    if (!isDesktopShell()) {
      setIsLoaded(true);
      return;
    }

    (async () => {
      const settings = await getDesktopSettings();
      if (settings) {
        if (settings.preferred_protocol) {
          setProtocol(settings.preferred_protocol);
        }
        if (typeof settings.auto_connect === "boolean") {
          setAutoConnect(settings.auto_connect);
        }
        setWgQuickPath(settings.wg_quick_path ?? "");
        setOpenvpnPath(settings.openvpn_path ?? "");
        setWireguardCliPath(settings.wireguard_cli_path ?? "");
      }
      setIsLoaded(true);
    })();
  }, []);

  // Save settings to Tauri when they change
  useEffect(() => {
    if (!isDesktopShell() || !isLoaded) return;

    void updateDesktopSettings({
      preferredProtocol: protocol,
      autoConnect,
      wgQuickPath,
      openvpnPath,
      wireguardCliPath,
    });
  }, [
    protocol,
    autoConnect,
    wgQuickPath,
    openvpnPath,
    wireguardCliPath,
    isLoaded,
  ]);

  return {
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
    isLoaded,
  };
}

// Hook to handle deep link registration and handling
export function useDeepLinks() {
  useEffect(() => {
    if (!isDesktopShell()) return;

    const anyWin = window as any;
    const deepLink = anyWin.__TAURI__?.deepLink;
    if (!deepLink) return;

    const scheme = "vpnvpn";

    const handleDeepLink = async (url: string) => {
      log("received deep link:", url);
      try {
        const parsed = new URL(url);
        if (
          parsed.hostname === "auth" &&
          parsed.pathname === "/email-callback" &&
          parsed.searchParams.has("next")
        ) {
          const next = parsed.searchParams.get("next");
          if (next) {
            try {
              await fetch(next);
              window.location.href = "/desktop?desktop=1";
            } catch (err) {
              logError("failed to complete email callback", err);
            }
          }
        }
      } catch (err) {
        logError("failed to parse deep link URL", err);
      }
    };

    (async () => {
      try {
        if (typeof deepLink.isRegistered === "function") {
          try {
            const installed = await deepLink.isRegistered(scheme);
            if (!installed && typeof deepLink.register === "function") {
              await deepLink.register(scheme);
            }
          } catch (err) {
            logError("deep-link registration check failed", err);
          }
        }

        if (typeof deepLink.getCurrent === "function") {
          try {
            const urls = (await deepLink.getCurrent()) as string[] | null;
            if (urls && urls.length > 0) {
              await handleDeepLink(urls[urls.length - 1]);
            }
          } catch (err) {
            logError("failed to read current deep link", err);
          }
        }

        if (typeof deepLink.onOpenUrl === "function") {
          try {
            await deepLink.onOpenUrl(async (urls: string[]) => {
              if (!urls || urls.length === 0) return;
              await handleDeepLink(urls[urls.length - 1]);
            });
          } catch (err) {
            logError("failed to subscribe to deep links", err);
          }
        }
      } catch (err) {
        logError("deep-link init failed", err);
      }
    })();
  }, []);
}

// Hook to handle sign out
export function useSignOut() {
  return useCallback(() => {
    window.location.href = "/api/auth/signout";
  }, []);
}
