import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface DnsValidatedCertificateArgs {
  domainName: pulumi.Input<string>;
  /**
   * The Route53 Hosted Zone ID to create validation records in.
   * If not provided, it will be looked up by the domain name.
   */
  zoneId?: pulumi.Input<string>;
}

export class DnsValidatedCertificate extends pulumi.ComponentResource {
  public readonly certificateArn: pulumi.Output<string>;

  constructor(
    name: string,
    args: DnsValidatedCertificateArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("vpnvpn:components:DnsValidatedCertificate", name, {}, opts);

    // 1. Request the certificate
    const cert = new aws.acm.Certificate(
      `${name}-cert`,
      {
        domainName: args.domainName,
        validationMethod: "DNS",
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    // 2. Look up the Hosted Zone
    // We assume the zone name is the domain name's suffix (e.g. vpnvpn.dev for *.vpnvpn.dev)
    // or explicitly provided via args.

    let hostedZoneId: pulumi.Input<string>;

    if (args.zoneId) {
      hostedZoneId = args.zoneId;
    } else {
      // Fallback: assume the zone is 'vpnvpn.dev.' for now as per project defaults
      // In a real generic component we'd need more logic or a 'rootDomain' arg.
      const zone = aws.route53.getZoneOutput({ name: "vpnvpn.dev." });
      hostedZoneId = zone.id;
    }

    // 3. Create validation records
    const validationRecords = cert.domainValidationOptions.apply((options) =>
      options.map((option) => {
        return new aws.route53.Record(
          `${name}-validation-${option.domainName}`,
          {
            allowOverwrite: true,
            name: option.resourceRecordName,
            records: [option.resourceRecordValue],
            ttl: 60,
            type: option.resourceRecordType,
            zoneId: hostedZoneId,
          },
          { parent: this }
        );
      })
    );

    // 4. Wait for validation
    const certValidation = new aws.acm.CertificateValidation(
      `${name}-validation`,
      {
        certificateArn: cert.arn,
        validationRecordFqdns: validationRecords.apply((records) =>
          records.map((record) => record.fqdn)
        ),
      },
      { parent: this }
    );

    this.certificateArn = certValidation.certificateArn;
    this.registerOutputs({ certificateArn: this.certificateArn });
  }
}
