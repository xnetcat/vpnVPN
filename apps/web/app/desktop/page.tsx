"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function DesktopAuthPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"redirecting" | "error">("redirecting");

  useEffect(() => {
    const token = searchParams.get("token");
    const callbackUrl = searchParams.get("callbackUrl");

    if (token) {
      // Direct token handoff — redirect to desktop app via deep link
      window.location.href = `vpnvpn://auth?token=${encodeURIComponent(token)}`;
      return;
    }

    if (callbackUrl) {
      // NextAuth callback flow — wrap in deep link
      window.location.href = `vpnvpn://auth/email-callback?next=${encodeURIComponent(callbackUrl)}`;
      return;
    }

    setStatus("error");
  }, [searchParams]);

  if (status === "error") {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: "system-ui" }}>
        <h1>vpnVPN Desktop</h1>
        <p>Missing authentication token. Please sign in from the desktop app.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, textAlign: "center", fontFamily: "system-ui" }}>
      <h1>vpnVPN Desktop</h1>
      <p>Redirecting to the desktop app...</p>
      <p style={{ fontSize: 14, color: "#666", marginTop: 16 }}>
        If nothing happens, make sure vpnVPN Desktop is installed.
      </p>
    </div>
  );
}
