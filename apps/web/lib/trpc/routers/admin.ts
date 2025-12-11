import { z } from "zod";
import { router, adminProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { WEB_ENV } from "@/env";

function getControlPlaneConfig() {
  const base = WEB_ENV.CONTROL_PLANE_API_URL ?? WEB_ENV.NEXT_PUBLIC_API_URL;
  const apiKey = WEB_ENV.CONTROL_PLANE_API_KEY;

  if (!base || !apiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Control plane not configured",
    });
  }
  return { base: base.replace(/\/$/, ""), apiKey };
}

export const adminRouter = router({
  // Server management
  listServers: adminProcedure.query(async () => {
    const { base, apiKey } = getControlPlaneConfig();
    const url = `${base}/servers`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[admin] GET /servers failed", {
        status: res.status,
        body: text,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch servers",
      });
    }

    const data = await res.json();
    return data || [];
  }),

  deleteServer: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { base, apiKey } = getControlPlaneConfig();
      const url = `${base}/servers/${encodeURIComponent(input.id)}`;

      const res = await fetch(url, {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
      });

      if (res.status === 404) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Server not found",
        });
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[admin] DELETE /servers failed", {
          status: res.status,
          body: text,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete server",
        });
      }

      return { status: "deleted" };
    }),

  // Token management
  listTokens: adminProcedure.query(async () => {
    const { base, apiKey } = getControlPlaneConfig();
    const url = `${base}/tokens`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch tokens",
      });
    }

    const data = await res.json();
    return data || [];
  }),

  createToken: adminProcedure
    .input(z.object({ label: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { base, apiKey } = getControlPlaneConfig();
      const url = `${base}/tokens`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({ label: input.label }),
      });

      if (!res.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create token",
        });
      }

      const data = await res.json();
      return data;
    }),

  revokeToken: adminProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const { base, apiKey } = getControlPlaneConfig();
      const url = `${base}/tokens/${encodeURIComponent(input.token)}`;

      const res = await fetch(url, {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
      });

      if (!res.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to revoke token",
        });
      }

      const data = await res.json();
      return data;
    }),
});
