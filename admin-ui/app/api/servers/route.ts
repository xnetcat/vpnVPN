import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json([
    { id: "node-1", region: "us-east-1", status: "healthy", sessions: 12 },
    { id: "node-2", region: "us-east-1", status: "healthy", sessions: 9 },
  ]);
}
