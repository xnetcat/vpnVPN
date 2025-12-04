import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "vpnVPN Desktop",
  description: "vpnVPN Desktop Application",
};

// Desktop layout without the SiteHeader - the DesktopShell component
// provides its own custom header designed for the desktop app experience.
export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // We return just the children without any header wrapper.
  // The DesktopShell component handles its own full-screen layout with header.
  return <>{children}</>;
}
