import { router, paidProcedure } from "../init";
import { TRPCError } from "@trpc/server";

const base = process.env.CONTROL_PLANE_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
const apiKey = process.env.CONTROL_PLANE_API_KEY;

export const serversRouter = router({
  list: paidProcedure.query(async () => {
    if (!base || !apiKey) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Control plane not configured",
      });
    }

    const url = `${base.replace(/\/$/, "")}/servers`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[servers] GET /servers failed", {
        status: res.status,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch servers",
      });
    }

    const data = await res.json();

    // Transform control plane data to match expected format
    const servers = (data || []).map((item: any) => ({
      id: item.id || "unknown",
      region: item.metadata?.region || "unknown",
      status: item.status || "unknown",
      sessions: item.metrics?.sessions || 0,
      lastSeen: item.lastSeen,
    }));

    return servers;
  }),
});

