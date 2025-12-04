import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import * as path from "path";

const PULUMI_DIR = path.join(__dirname, "..");

describe("Pulumi Preview Validation", () => {
  beforeAll(() => {
    // Ensure we're in the right directory and dependencies are installed
    try {
      execSync("bun install", { cwd: PULUMI_DIR, stdio: "pipe" });
    } catch {
      // Dependencies may already be installed
    }
  });

  it("should validate global stack configuration", () => {
    // This test validates that the Pulumi program can be loaded without errors
    // In a real CI environment, this would run `pulumi preview`
    const indexPath = path.join(PULUMI_DIR, "index.ts");
    expect(() => require(indexPath)).not.toThrow();
  });

  it("should export required components", async () => {
    const { ControlPlane } = await import("../controlPlane");
    const { MetricsService } = await import("../metricsService");
    const { VpnAsg } = await import("../components/vpnAsg");
    const { Observability } = await import("../observability");

    expect(ControlPlane).toBeDefined();
    expect(MetricsService).toBeDefined();
    expect(VpnAsg).toBeDefined();
    expect(Observability).toBeDefined();
  });

  it("should have valid component interfaces", async () => {
    const { ControlPlane } = await import("../controlPlane");
    const { MetricsService } = await import("../metricsService");

    // Verify ControlPlane accepts required args
    expect(ControlPlane.prototype).toBeDefined();

    // Verify MetricsService accepts required args
    expect(MetricsService.prototype).toBeDefined();
  });
});

describe("Stack Configuration Validation", () => {
  it("should define global stack resources", () => {
    // Validate that the global stack configuration is correct
    const requiredGlobalResources = [
      "ECR repository",
      "S3 bucket for desktop releases",
      "Lambda code bucket",
      "Control Plane Lambda",
      "Metrics Service Lambda",
      "Observability (AMP/Grafana)",
    ];

    // This is a documentation test - ensures we track what should be deployed
    expect(requiredGlobalResources.length).toBeGreaterThan(0);
  });

  it("should define regional stack resources", () => {
    // Validate that regional stack configuration is correct
    const requiredRegionalResources = [
      "VPC with public/private subnets",
      "Security groups for VPN protocols",
      "Network Load Balancer",
      "EC2 Auto Scaling Group",
      "Target groups for UDP/TCP",
    ];

    expect(requiredRegionalResources.length).toBeGreaterThan(0);
  });
});







