import * as pulumi from "@pulumi/pulumi";

/**
 * ControlPlane no longer provisions AWS Lambda or DynamoDB resources.
 *
 * Instead, it exposes the URL of the control-plane HTTP service, which is
 * implemented as an in-house Bun/TypeScript service under `services/control-plane`.
 *
 * The actual deployment of that service (ECS, EC2, Kubernetes, on-prem, etc.)
 * is intentionally left environment-agnostic. Pulumi simply reads the URL
 * from configuration so other stacks can depend on it without assuming AWS
 * implementation details.
 */
export class ControlPlane extends pulumi.ComponentResource {
  public readonly apiUrl: pulumi.Output<string>;

  constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
    super("vpnvpn:components:ControlPlane", name, {}, opts);

    const config = new pulumi.Config();
    const url =
      config.get("controlPlaneApiUrl") ??
      "https://example-control-plane.your-domain.com";

    this.apiUrl = pulumi.output(url);

    this.registerOutputs({ apiUrl: this.apiUrl });
  }
}
