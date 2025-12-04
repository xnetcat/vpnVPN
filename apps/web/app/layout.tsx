import "./globals.css";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { TRPCProvider } from "@/lib/trpc/Provider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "vpnVPN Admin",
  description: "Admin dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">
        <TRPCProvider>
          {/* Header */}
          <SiteHeader />
          {children}
          <Analytics />
          <SpeedInsights />
        </TRPCProvider>
      </body>
    </html>
  );
}
