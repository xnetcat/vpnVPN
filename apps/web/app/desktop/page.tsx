import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";
import DesktopShell from "@/components/DesktopShell";
import { headers } from "next/headers";

type DesktopPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function DesktopPage({ searchParams }: DesktopPageProps) {
  // Log request details for debugging
  const headersList = await headers();
  const userAgent = headersList.get("user-agent") ?? "unknown";
  const referer = headersList.get("referer") ?? "none";

  console.log("[desktop-page] Request received", {
    userAgent: userAgent.substring(0, 100),
    referer,
    timestamp: new Date().toISOString(),
  });

  const resolved =
    (searchParams && (await searchParams)) ||
    ({} as Record<string, string | string[] | undefined>);

  const isDesktopShell =
    (resolved.desktop as string | undefined)?.toString() === "1";

  console.log("[desktop-page] searchParams resolved", {
    isDesktopShell,
    rawDesktopParam: resolved.desktop,
  });

  // If this is being opened in a normal browser (no desktop=1 flag), treat it
  // as a shortcut to the main dashboard instead of rendering the desktop shell
  // UI which is meant for the embedded Tauri app.
  if (!isDesktopShell) {
    console.log("[desktop-page] Redirecting to /dashboard (no desktop=1 flag)");
    redirect("/dashboard");
  }

  console.log("[desktop-page] Checking user authentication and subscription...");
  const gate = await requirePaidUser();
  console.log("[desktop-page] Gate result:", {
    ok: gate.ok,
    reason: gate.ok ? undefined : gate.reason,
    tier: gate.ok ? gate.tier : undefined,
  });

  if (!gate.ok) {
    const redirectUrl =
      gate.reason === "unauthenticated"
        ? "/auth/signin?desktop=1&callbackUrl=/desktop?desktop=1"
        : "/pricing";
    console.log("[desktop-page] Redirecting due to gate failure:", {
      reason: gate.reason,
      redirectUrl,
    });
    redirect(redirectUrl);
  }

  console.log("[desktop-page] Rendering DesktopShell for authenticated user");
  return <DesktopShell />;
}
