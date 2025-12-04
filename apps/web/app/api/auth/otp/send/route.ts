import { NextResponse } from "next/server";
import { prisma } from "@vpnvpn/db";
import { sendEmail } from "@/lib/email";

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

// In-memory rate limiting (per IP and per email)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 3; // 3 requests per minute per key

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  entry.count += 1;
  return false;
}

// Generate a 6-digit numeric code
function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Rate limit by email
    if (isRateLimited(`email:${normalizedEmail}`)) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait a minute before trying again.",
        },
        { status: 429, headers: corsHeaders },
      );
    }

    // Rate limit by IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    if (isRateLimited(`ip:${ip}`)) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait a minute before trying again.",
        },
        { status: 429, headers: corsHeaders },
      );
    }

    // Generate OTP code
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate previous codes for this email
    await prisma.desktopLoginCode.updateMany({
      where: { email: normalizedEmail, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    // Store the code in the database
    await prisma.desktopLoginCode.create({
      data: {
        email: normalizedEmail,
        code,
        url: "desktop-otp", // Marker for OTP-based auth
        expiresAt,
      },
    });

    // Send the email
    await sendEmail({
      to: normalizedEmail,
      template: "otp_code",
      data: {
        code,
        expiresMinutes: 10,
      },
    });

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("[otp/send] Error:", error);
    return NextResponse.json(
      { error: "Failed to send verification code" },
      { status: 500, headers: corsHeaders },
    );
  }
}
