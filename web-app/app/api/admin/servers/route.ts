import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.reason },
      { status: gate.reason === "unauthenticated" ? 401 : 403 }
    );
  }

  const base = process.env.CONTROL_PLANE_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  const apiKey = process.env.CONTROL_PLANE_API_KEY;

  if (!base || !apiKey) {
    console.error("[admin-api] control plane env not configured");
    return NextResponse.json(
      { error: "Control plane not configured" },
      { status: 500 }
    );
  }

  const url = `${base.replace(/\/$/, "")}/servers`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[admin-api] GET /servers failed", {
        status: res.status,
        body: text,
      });
      return NextResponse.json(
        { error: "Failed to fetch servers" },
        { status: 502 }
      );
    }

    const data = await res.json();

    return NextResponse.json(data);
  } catch (err) {
    console.error("[admin-api] GET /servers error", { err });
    return NextResponse.json(
      { error: "Upstream error" },
      { status: 502 }
    );
  }
}


