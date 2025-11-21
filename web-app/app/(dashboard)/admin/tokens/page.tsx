import { requireAdmin } from "@/lib/requireAdmin";
import { redirect } from "next/navigation";
import TokenList from "@/components/admin/TokenList";
import CreateTokenButton from "@/components/admin/CreateTokenButton";

export default async function AdminTokensPage() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    redirect(gate.reason === "unauthenticated" ? "/api/auth/signin" : "/");
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Server Tokens</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage registration tokens for VPN servers
          </p>
        </div>
        <CreateTokenButton />
      </div>

      <TokenList />
    </main>
  );
}

