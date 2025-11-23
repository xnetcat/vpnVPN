import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildWireGuardConfig,
  buildOpenVpnConfig,
  buildIkev2Config,
} from "../desktopConfig";

const ORIGINAL_ENV = process.env;

describe("desktop VPN config builders", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("builds a WireGuard config using env endpoint and public key", () => {
    process.env.NEXT_PUBLIC_WG_ENDPOINT = "wg.example.com:51820";
    process.env.NEXT_PUBLIC_WG_SERVER_PUBLIC_KEY = "SERVER_PUB_KEY";

    const cfg = buildWireGuardConfig({
      privateKey: "PRIV_KEY",
      assignedIp: "10.0.0.2/32",
    });

    expect(cfg).toContain("PrivateKey = PRIV_KEY");
    expect(cfg).toContain("Address = 10.0.0.2/32");
    expect(cfg).toContain("Endpoint = wg.example.com:51820");
    expect(cfg).toContain("PublicKey = SERVER_PUB_KEY");
  });

  it("builds an OpenVPN config using env remote and port", () => {
    process.env.NEXT_PUBLIC_OVPN_REMOTE = "ovpn.example.com";
    process.env.NEXT_PUBLIC_OVPN_PORT = "443";

    const cfg = buildOpenVpnConfig({
      assignedIp: "10.0.0.5",
      serverName: "us-east",
    });

    expect(cfg).toContain("remote ovpn.example.com 443");
    expect(cfg).toContain("# Assigned IP hint: 10.0.0.5");
    expect(cfg).toContain("# Server: us-east");
  });

  it("builds an IKEv2 config using env remote gateway", () => {
    process.env.NEXT_PUBLIC_IKEV2_REMOTE = "ikev2.example.com";

    const cfg = buildIkev2Config({ serverName: "us-west" });

    expect(cfg).toContain("# Remote gateway: ikev2.example.com");
    expect(cfg).toContain("right=ikev2.example.com");
    expect(cfg).toContain("# Server: us-west");
  });
});
