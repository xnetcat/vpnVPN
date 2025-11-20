import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export class Observability extends pulumi.ComponentResource {
  public readonly ampWorkspaceId: pulumi.Output<string>;
  public readonly amgWorkspaceUrl: pulumi.Output<string>;

  constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
    super("vpnvpn:components:Observability", name, {}, opts);

    // Some aws provider versions expose AMP/Grafana under different namespaces.
    // We cast through any here to avoid tight coupling to a specific minor version.
    const awsAny: any = aws;

    const amp = new awsAny.prometheus.Workspace(
      `${name}-amp`,
      { alias: `${pulumi.getStack()}-vpnvpn` },
      { parent: this }
    );

    const amg = new awsAny.grafana.Workspace(
      `${name}-amg`,
      {
        accountAccessType: "CURRENT_ACCOUNT",
        authenticationProviders: ["AWS_SSO"],
        permissionType: "SERVICE_MANAGED",
        roleArn: undefined,
        dataSources: ["PROMETHEUS"],
        name: `${pulumi.getStack()}-vpnvpn`,
      },
      { parent: this }
    );

    this.ampWorkspaceId = amp.id;
    this.amgWorkspaceUrl = amg.endpoint;
    this.registerOutputs({
      ampWorkspaceId: this.ampWorkspaceId,
      amgWorkspaceUrl: this.amgWorkspaceUrl,
    });
  }
}
