import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPaths = new Set([
  "/dashboard",
  "/servers",
  "/proxies",
  "/account",
]);

export function middleware(req: NextRequest) {
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
  matcher: ["/dashboard", "/servers", "/proxies", "/account"],
};

