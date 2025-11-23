import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = new Set([
  "/dashboard",
  "/servers",
  "/proxies",
  "/account",
  "/devices",
  "/admin",
]);

function rewriteForSubdomains(req: NextRequest): NextResponse | null {
  const url = req.nextUrl.clone();
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  const pathname = url.pathname || "/";

  // dashboard.domain.com -> /dashboard
  if (host.startsWith("dashboard.") && pathname === "/") {
    url.pathname = "/dashboard";
    return NextResponse.rewrite(url);
  }

  // admin.domain.com -> /admin
  if (host.startsWith("admin.") && pathname === "/") {
    url.pathname = "/admin";
    return NextResponse.rewrite(url);
  }

  // app.domain.com -> /desktop (desktop client UI)
  if (host.startsWith("app.") && pathname === "/") {
    url.pathname = "/desktop";
    return NextResponse.rewrite(url);
  }

  return null;
}

export function middleware(req: NextRequest) {
  const rewritten = rewriteForSubdomains(req);
  if (rewritten) {
    return rewritten;
  }

  const { pathname } = req.nextUrl;
  if (!protectedPaths.has(pathname)) return NextResponse.next();

  const hasSession =
    req.cookies.has("__Secure-next-auth.session-token") ||
    req.cookies.has("next-auth.session-token");

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("redirected", "1");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware for all app routes (excluding Next internals) so we can
  // implement host-based routing while enforcing auth only on protectedPaths.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
