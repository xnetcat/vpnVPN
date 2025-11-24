import { z } from "zod";
import { router, publicProcedure } from "../init";
import { consumeDesktopCode } from "@/lib/desktopCodes";

const ADMIN_BASE =
  process.env.VPN_NODE_ADMIN_URL || "http://vpn-node:9090";

export const desktopRouter = router({
  // Resolve a 6-digit desktop login code to the original NextAuth callback URL.
  // Returns { ok: true, url } on success or { ok: false } when the code is
  // invalid or expired.
  resolveCode: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        code: z.string().min(6).max(6),
      }),
    )
    .mutation(async ({ input }) => {
      const url = await consumeDesktopCode(input.email, input.code);
      if (!url) {
        return { ok: false as const };
      }
      return { ok: true as const, url };
    }),

  // Discover the WireGuard server public key from the vpn-node admin endpoint.
  // Returns { publicKey: string | null } without throwing on errors so the
  // client can fall back to env configuration.
  serverPubkey: publicProcedure.query(async () => {
    try {
      const res = await fetch(`${ADMIN_BASE}/pubkey`, {
        cache: "no-store",
      });

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error(
          "[desktop] failed to fetch vpn-node pubkey via admin endpoint",
          res.status,
        );
        return { publicKey: null as string | null };
      }

      const data = (await res.json()) as string | null;
      return { publicKey: data };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[desktop] error while fetching vpn-node pubkey via admin endpoint",
        err,
      );
      return { publicKey: null as string | null };
    }
  }),
});


