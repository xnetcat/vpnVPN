'use server'

import { NextResponse } from "next/server";

type AddPeerPayload = {
  publicKey: string;
  userId: string;
  allowedIps: string[];
};

const CONTROL_PLANE_BASE =
  process.env.CONTROL_PLANE_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
const CONTROL_PLANE_API_KEY = process.env.CONTROL_PLANE_API_KEY;

if (!CONTROL_PLANE_BASE) {
  console.warn(
    "[controlPlane] CONTROL_PLANE_API_URL or NEXT_PUBLIC_API_BASE_URL is not set. Device registration will fail."
  );
}

if (!CONTROL_PLANE_API_KEY) {
  console.warn(
    "[controlPlane] CONTROL_PLANE_API_KEY is not set. Admin/device writes to control plane will fail."
  );
}

export async function addPeerForDevice(payload: AddPeerPayload): Promise<void> {
  if (!CONTROL_PLANE_BASE || !CONTROL_PLANE_API_KEY) {
    throw new Error("Control plane not configured");
  }

  const url = `${CONTROL_PLANE_BASE.replace(/\/$/, "")}/peers`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CONTROL_PLANE_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[controlPlane] addPeer non-200", {
        status: res.status,
        body: text,
      });
      throw new Error(`addPeer failed with status ${res.status}`);
    }

    console.log("[controlPlane] addPeer ok", {
      userId: payload.userId,
      hasAllowedIps: payload.allowedIps.length > 0,
    });
  } catch (err) {
    console.error("[controlPlane] addPeer error", { err });
    throw err;
  }
}


