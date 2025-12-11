import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@vpnvpn/web/lib/trpc/routers";
import { API_BASE_URL } from "./config";

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_BASE_URL.replace(/\/$/, "")}/api/trpc`,
      transformer: superjson,
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});
