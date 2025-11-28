import { NextResponse } from "next/server";
import { prisma } from "@vpnvpn/db";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

// Allowed origins for CORS (desktop app)
const allowedOrigins = [
  "http://localhost:5173", // Vite dev server
  "tauri://localhost", // Tauri production build
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Handle preflight requests
export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

// In-memory rate limiting for verification attempts
const verifyRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_ATTEMPTS = 5; // 5 attempts per minute

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = verifyRateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    verifyRateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return true;
  }

  entry.count += 1;
  return false;
}

// Generate a secure session token
function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function POST(req: Request) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json();
    const { email, code } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { error: "Invalid code format" },
        { status: 400, headers: corsHeaders }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Rate limit verification attempts by email
    if (isRateLimited(`verify:${normalizedEmail}`)) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please wait a minute." },
        { status: 429, headers: corsHeaders }
      );
    }

    // Rate limit by IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (isRateLimited(`verify-ip:${ip}`)) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please wait a minute." },
        { status: 429, headers: corsHeaders }
      );
    }

    // Find the code in the database
    const otpEntry = await prisma.desktopLoginCode.findFirst({
      where: {
        email: normalizedEmail,
        code,
        expiresAt: { gt: new Date() },
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpEntry) {
      return NextResponse.json(
        { error: "Invalid or expired code" },
        { status: 401, headers: corsHeaders }
      );
    }

    // Mark the code as consumed
    await prisma.desktopLoginCode.update({
      where: { id: otpEntry.id },
      data: { consumedAt: new Date() },
    });

    // Find or create the user
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          emailVerified: new Date(),
        },
      });
    } else if (!user.emailVerified) {
      // Mark email as verified if not already
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    }

    // Create a session for the user
    const sessionToken = generateSessionToken();
    const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: sessionExpiry,
      },
    });

    // Set the session cookie (NextAuth compatible)
    const cookieStore = await cookies();
    const isSecure = process.env.NODE_ENV === "production";
    const cookieName = isSecure
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token";

    cookieStore.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      expires: sessionExpiry,
    });

    // Return the session token for the desktop app to store
    return NextResponse.json(
      {
        success: true,
        sessionToken, // Desktop app can store this for API calls
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[otp/verify] Error:", error);
    return NextResponse.json(
      { error: "Failed to verify code" },
      { status: 500, headers: corsHeaders }
    );
  }
}
