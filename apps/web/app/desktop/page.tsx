import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";
import DesktopShell from "@/components/DesktopShell";

type DesktopPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function DesktopPage({ searchParams }: DesktopPageProps) {
  const resolved =
    (searchParams && (await searchParams)) ||
    ({} as Record<string, string | string[] | undefined>);

  const isDesktopShell =
    (resolved.desktop as string | undefined)?.toString() === "1";

  // If this is being opened in a normal browser (no desktop=1 flag), treat it
  // as a shortcut to the main dashboard instead of rendering the desktop shell
  // UI which is meant for the embedded Tauri app.
  if (!isDesktopShell) {
    redirect("/dashboard");
  }

  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated"
        ? "/auth/signin?desktop=1&callbackUrl=/desktop?desktop=1"
        : "/pricing"
    );
  }

  return <DesktopShell />;
}
