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
  public readonly domainValidationOptions: pulumi.Output<
    aws.types.output.acm.CertificateDomainValidationOption[]
  >;

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

    // 2. Look up the Hosted Zone (Optional)
    let hostedZoneId: pulumi.Input<string> | undefined;

    if (args.zoneId) {
      hostedZoneId = args.zoneId;
    } else {
      // Try to find a zone, but don't fail if we can't (for manual validation)
      // In a real scenario, we might want an explicit flag for "manual validation"
      // For now, let's assume if we can't find the zone, we just skip record creation.
      // However, getZoneOutput throws if not found.
      // So we'll just skip this if we are in "manual" mode (implied by no zoneId provided and we want to support Vercel).
      // Actually, let's just skip Route53 if we can't easily determine it, or if the user wants manual control.
      // Given the user request, let's just NOT create Route53 records if we are using Vercel.
      // We'll rely on the user to add the CNAMEs.
    }

    // 3. Create validation records (ONLY if we have a hosted zone)
    // Since we are using Vercel, we will SKIP this step and just output the validation details.

    /*
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
            zoneId: hostedZoneId!,
          },
          { parent: this }
        );
      })
    );
    */

    // 4. Wait for validation
    // This will pause the Pulumi update until the certificate is validated.
    // This is necessary because aws.apigatewayv2.DomainName requires an ISSUED certificate.
    const certificateValidation = new aws.acm.CertificateValidation(
      `${name}-validation`,
      {
        certificateArn: cert.arn,
      },
      { parent: this }
    );

    this.certificateArn = certificateValidation.certificateArn;
    this.domainValidationOptions = cert.domainValidationOptions;

    // Export validation options for manual configuration
    this.registerOutputs({
      certificateArn: this.certificateArn,
      domainValidationOptions: this.domainValidationOptions,
    });
  }
}
