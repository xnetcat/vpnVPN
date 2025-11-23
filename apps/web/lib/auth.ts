import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      allowDangerousEmailAccountLinking: true,
    }),
    EmailProvider({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        (session.user as any).id = token.id ?? token.sub;
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
        if (!existing.stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
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
              dashboardUrl: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard`,
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
  secret: process.env.NEXTAUTH_SECRET,
};

// NextAuth route handler factory (for app router)
export const getSession = () => getServerSession(authOptions);
