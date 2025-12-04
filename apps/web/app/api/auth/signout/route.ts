import { NextResponse } from "next/server";
import { prisma } from "@vpnvpn/db";

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Handle preflight requests
export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function POST(req: Request) {
  const corsHeaders = getCorsHeaders(req);

  try {
    // Check for Authorization header (desktop app)
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);

      // Delete the session from the database
      await prisma.session.deleteMany({
        where: { sessionToken: token },
      });

      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    // For web app, NextAuth handles signout via its own endpoint
    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("[signout] Error:", error);
    return NextResponse.json(
      { error: "Failed to sign out" },
      { status: 500, headers: corsHeaders },
    );
  }
}
