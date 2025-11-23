"use server";

type AddPeerPayload = {
  publicKey: string;
  userId: string;
  allowedIps: string[];
  serverId?: string;
  country?: string;
  region?: string;
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

function getBaseUrl(): string {
  if (!CONTROL_PLANE_BASE || !CONTROL_PLANE_API_KEY) {
    throw new Error("Control plane not configured");
  }
  return CONTROL_PLANE_BASE.replace(/\/$/, "");
}

export async function addPeerForDevice(payload: AddPeerPayload): Promise<void> {
  const base = getBaseUrl();
  const url = `${base}/peers`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CONTROL_PLANE_API_KEY!,
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

export async function revokePeersForUser(userId: string): Promise<void> {
  const base = getBaseUrl();
  const url = `${base}/peers/revoke-for-user`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CONTROL_PLANE_API_KEY!,
      },
      body: JSON.stringify({ userId }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[controlPlane] revokePeersForUser non-200", {
        status: res.status,
        body: text,
        userId,
      });
      throw new Error(`revokePeersForUser failed with status ${res.status}`);
    }

    console.log("[controlPlane] revokePeersForUser ok", { userId });
  } catch (err) {
    console.error("[controlPlane] revokePeersForUser error", { err, userId });
    throw err;
  }
}

export async function revokePeerByPublicKey(publicKey: string): Promise<void> {
  const base = getBaseUrl();
  const url = `${base}/peers/${encodeURIComponent(publicKey)}`;

  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "x-api-key": CONTROL_PLANE_API_KEY!,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[controlPlane] revokePeerByPublicKey non-200", {
        status: res.status,
        body: text,
        publicKey,
      });
      throw new Error(`revokePeerByPublicKey failed with status ${res.status}`);
    }

    console.log("[controlPlane] revokePeerByPublicKey ok", { publicKey });
  } catch (err) {
    console.error("[controlPlane] revokePeerByPublicKey error", {
      err,
      publicKey,
    });
    throw err;
  }
}
