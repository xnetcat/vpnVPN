import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import { getServerSession } from "next-auth";
import { prisma } from "@vpnvpn/db";
import { createDesktopCode } from "@/lib/desktopCodes";
import { stripe } from "@/lib/stripe";
import { WEB_ENV } from "@/env";

let _authOptions: NextAuthOptions | null = null;
function buildAuthOptions(): NextAuthOptions {
  if (_authOptions) return _authOptions;
  _authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHubProvider({
      clientId: WEB_ENV.GITHUB_ID,
      clientSecret: WEB_ENV.GITHUB_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    GoogleProvider({
      clientId: WEB_ENV.GOOGLE_CLIENT_ID,
      clientSecret: WEB_ENV.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    EmailProvider({
      // We use Resend via a custom sendVerificationRequest handler instead of SMTP.
      // A dummy server value is still required by the provider types.
      server: WEB_ENV.EMAIL_SERVER || "",
      from: WEB_ENV.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url }) {
        try {
          // For desktop flows (callbackUrl -> /desktop), also include a vpnvpn://
          // deep link that wraps the NextAuth callback URL so the Tauri app can
          // complete the email login inside the embedded webview.
          let desktopUrl: string | undefined;
          let desktopCode: string | undefined;
          try {
            const parsed = new URL(url);
            const callbackUrlParam = parsed.searchParams.get("callbackUrl");
            const isDesktopFlow =
              callbackUrlParam &&
              decodeURIComponent(callbackUrlParam).includes("/desktop");

            if (isDesktopFlow) {
              const wrapped = encodeURIComponent(url);
              desktopUrl = `vpnvpn://auth/email-callback?next=${wrapped}`;

              // Also create a short-lived 6-digit desktop login code so the
              // user can connect the desktop app without relying on OS-level
              // deep link handling.
              desktopCode = await createDesktopCode(identifier, url);
            }
          } catch {
            // If URL parsing fails, skip desktop deep-link and fall back to normal link.
          }

          const { sendEmail } = await import("@/lib/email");
          await sendEmail({
            to: identifier,
            template: "magic_link",
            data: {
              url,
              desktopUrl,
              desktopCode,
            },
          });
        } catch (error) {
          console.error("[auth] failed to send magic link email via Resend", {
            identifier,
            url,
            error,
          });
          throw new Error("Failed to send magic link email");
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        const dbUser = await prisma.user.findUnique({
          where: { id: (user as any).id },
          select: { role: true },
        });
        token.role = dbUser?.role ?? "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        (session.user as any).id = token.id ?? token.sub;
        (session.user as any).role = token.role ?? "user";
      }
      return session;
    },
  },
  events: {
    // When a user is created, ensure a Stripe Customer exists and is linked.
    async createUser({ user }) {
      try {
        const existing = await prisma.user.findUnique({
          where: { id: user.id },
        });
        if (!existing) return;

        // Create Stripe customer if not exists
        if (!existing.stripeCustomerId && WEB_ENV.STRIPE_SECRET_KEY) {
          const customer = await stripe.customers.create({
            email: existing.email ?? undefined,
            name: existing.name ?? undefined,
            metadata: { userId: existing.id },
          });
          await prisma.user.update({
            where: { id: existing.id },
            data: { stripeCustomerId: customer.id },
          });
        }

        // Send welcome email
        if (existing.email) {
          const { sendEmail } = await import("@/lib/email");
          await sendEmail({
            to: existing.email,
            template: "welcome",
            data: {
              name: existing.name,
              dashboardUrl: `${WEB_ENV.NEXTAUTH_URL}/dashboard`,
            },
          });
        }
      } catch (err) {
        console.error("createUser event error", err);
      }
    },
  },
  pages: {
    // Custom sign-in page implemented at `app/auth/signin/page.tsx`
    signIn: "/auth/signin",
  },
  secret: WEB_ENV.NEXTAUTH_SECRET,
  };
  return _authOptions;
}

// Lazy accessor so the options object is built at runtime, not import time.
export const authOptions: NextAuthOptions = new Proxy({} as NextAuthOptions, {
  get(_target, prop) {
    return (buildAuthOptions() as any)[prop];
  },
});

// NextAuth route handler factory (for app router)
export const getSession = () => getServerSession(authOptions);
