import "./globals.css";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import { TRPCProvider } from "@/lib/trpc/Provider";

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
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <TRPCProvider>
          {/* Header */}
          <SiteHeader />
          {children}
        </TRPCProvider>
      </body>
    </html>
  );
}
