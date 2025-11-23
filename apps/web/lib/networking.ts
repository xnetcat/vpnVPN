import crypto from "crypto";

/**
 * Deterministically allocate a /32 IP for a device from the 10.8.0.0/24 pool.
 * This keeps mapping stable without storing private data and avoids logging PII.
 */
export function allocateDeviceIp(userId: string, deviceId: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${userId}:${deviceId}`)
    .digest();

  // Reserve .1 for server, use .10-.250 for devices.
  const host = 10 + (hash[0] % 241); // 10..250
  return `10.8.0.${host}/32`;
}
