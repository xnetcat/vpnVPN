import { test, expect } from "bun:test";

const CONTROL_PLANE_URL = "http://localhost:4000/health";
const METRICS_URL = "http://localhost:4100/health";
const VPN_ADMIN_HEALTH_URL = "http://localhost:9090/health";
const WEB_URL = "http://localhost:3000";

test("control-plane health endpoint", async () => {
  const res = await fetch(CONTROL_PLANE_URL);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("metrics service health endpoint", async () => {
  const res = await fetch(METRICS_URL);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
});

test("vpn admin health endpoint", async () => {
  const res = await fetch(VPN_ADMIN_HEALTH_URL);
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text.trim()).toBe("ok");
});

test("web app root is reachable", async () => {
  const res = await fetch(WEB_URL);
  expect(res.status).toBe(200);
  const html = await res.text();
  // Basic sanity check that we got an HTML page with some content.
  expect(html.length).toBeGreaterThan(0);
});


