import { requirePaidUser } from "@/lib/requirePaidUser";
import { redirect } from "next/navigation";
import { createContext } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/routers/_app";
import ServersTable, { type ServerRow } from "@/components/ServersTable";

async function getServers(): Promise<ServerRow[]> {
  const ctx = await createContext();
  const caller = appRouter.createCaller(ctx);
  const servers = await caller.servers.list();
  return servers;
}

export default async function ServersPage() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    redirect(
      gate.reason === "unauthenticated" ? "/api/auth/signin" : "/pricing"
    );
  }

  const servers = await getServers();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Servers</h1>
      <ServersTable servers={servers} />
    </main>
  );
}
