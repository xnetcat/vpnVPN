import { router, paidProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { WEB_ENV } from "@/env";

const base = WEB_ENV.CONTROL_PLANE_API_URL;
const apiKey = WEB_ENV.CONTROL_PLANE_API_KEY;

export const proxiesRouter = router({
  list: paidProcedure.query(async () => {
    if (!base || !apiKey) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Control plane not configured",
      });
    }

    const url = `${base.replace(/\/$/, "")}/proxies`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("[proxies] GET /proxies failed", {
        status: res.status,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch proxies",
      });
    }

    const data = await res.json();

    const proxies: {
      proxyId: string;
      type: string;
      ip: string;
      port: number;
      latency?: number;
      score?: number;
      country?: string;
    }[] = (data || []).map((item: any) => ({
      proxyId: item.proxyId ?? `${item.ip}:${item.port}`,
      type: item.type ?? "unknown",
      ip: item.ip,
      port: item.port,
      latency: item.latency,
      score: item.score,
      country: item.country,
    }));

    proxies.sort((a, b) => {
      const la =
        typeof a.latency === "number" ? a.latency : Number.POSITIVE_INFINITY;
      const lb =
        typeof b.latency === "number" ? b.latency : Number.POSITIVE_INFINITY;
      return la - lb;
    });

    return proxies;
  }),
});
