import { NextResponse } from "next/server";
import { createContext } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/routers/_app";

export async function GET() {
  try {
    const ctx = await createContext();
    const caller = appRouter.createCaller(ctx);
    const servers = await caller.servers.list();
    return NextResponse.json(servers);
  } catch (err) {
    console.error("[desktop] failed to list servers", { err });
    return NextResponse.json(
      { error: "Failed to list servers" },
      { status: 500 },
    );
  }
}
