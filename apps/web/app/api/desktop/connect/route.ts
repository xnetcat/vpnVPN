import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Deprecated endpoint: desktop uses device.register tRPC for configs.
  return NextResponse.json(
    {
      error: "deprecated",
      message:
        "This endpoint is deprecated. The desktop app must use device.register (tRPC) which returns server-generated configs.",
    },
    { status: 410 }
  );
}
