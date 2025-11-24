import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";
import DesktopShell from "@/components/DesktopShell";

export default async function DesktopPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated"
        ? "/auth/signin?desktop=1&callbackUrl=/desktop"
        : "/pricing"
    );
  }

  return <DesktopShell />;
}
