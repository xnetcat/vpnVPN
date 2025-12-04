import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export class Observability extends pulumi.ComponentResource {
  public readonly ampWorkspaceId: pulumi.Output<string>;
  public readonly amgWorkspaceUrl: pulumi.Output<string>;

  constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
    super("vpnvpn:components:Observability", name, {}, opts);

    // Use aws.amp and aws.grafana directly
    const amp = new aws.amp.Workspace(
      `${name}-amp`,
      { alias: `${pulumi.getStack()}-vpnvpn` },
      { parent: this }
    );

    // Grafana requires AWS SSO to be enabled. Disabling for now to unblock deployment.
    /*
    // Create IAM role for Grafana
    const grafanaRole = new aws.iam.Role(
      `${name}-grafana-role`,
      {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "grafana.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const amg = new aws.grafana.Workspace(
      `${name}-amg`,
      {
        accountAccessType: "CURRENT_ACCOUNT",
        authenticationProviders: ["AWS_SSO"],
        permissionType: "SERVICE_MANAGED",
        roleArn: grafanaRole.arn,
        dataSources: ["PROMETHEUS"],
        name: `${pulumi.getStack()}-vpnvpn`,
      },
      { parent: this }
    );
    */

    this.ampWorkspaceId = amp.id;
    this.amgWorkspaceUrl = pulumi.output(""); // amg.endpoint;
    this.registerOutputs({
      ampWorkspaceId: this.ampWorkspaceId,
      amgWorkspaceUrl: this.amgWorkspaceUrl,
    });
  }
}
