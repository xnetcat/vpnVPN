import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In - vpnVPN",
  description: "Sign in to your vpnVPN account",
};

// Auth layout - the pages handle their own full-screen layouts
// when in desktop mode (desktop=1 param)
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
