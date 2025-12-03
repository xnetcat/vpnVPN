import * as policy from "@pulumi/policy";

/**
 * vpnVPN CrossGuard Policy Pack
 *
 * These policies enforce security and compliance requirements for the infrastructure.
 * Run with: pulumi up --policy-pack ./policy
 */

const policyPack = new policy.PolicyPack("vpnvpn-policies", {
  policies: [
    // Require Project tags on all taggable resources
    {
      name: "require-project-tag",
      description: "All resources must have a 'Project' tag",
      enforcementLevel: "advisory",
      validateResource: policy.validateResourceOfType(
        "aws:*:*",
        (args, reportViolation) => {
          const tags = (args.props as Record<string, unknown>)?.tags as
            | Record<string, string>
            | undefined;
          if (!tags || !tags.Project) {
            reportViolation("Resource is missing required 'Project' tag");
          }
        }
      ),
    },

    // Prevent public S3 buckets (except desktop-releases)
    {
      name: "no-public-s3-buckets",
      description: "S3 buckets should not be publicly accessible unless explicitly allowed",
      enforcementLevel: "advisory",
      validateResource: policy.validateResourceOfType(
        "aws:s3/bucket:Bucket",
        (args, reportViolation) => {
          const props = args.props as Record<string, unknown>;
          const bucketName = props.bucket as string | undefined;
          const acl = props.acl as string | undefined;

          // Allow public access only for desktop-releases bucket
          if (
            acl === "public-read" &&
            bucketName &&
            !bucketName.includes("desktop")
          ) {
            reportViolation(
              `S3 bucket '${bucketName}' has public-read ACL. Only desktop release buckets should be public.`
            );
          }
        }
      ),
    },

    // Ensure Lambda functions have appropriate timeouts
    {
      name: "lambda-timeout-limit",
      description: "Lambda functions should have a reasonable timeout",
      enforcementLevel: "advisory",
      validateResource: policy.validateResourceOfType(
        "aws:lambda/function:Function",
        (args, reportViolation) => {
          const timeout = (args.props as Record<string, unknown>)
            ?.timeout as number;
          if (timeout && timeout > 60) {
            reportViolation(
              `Lambda function timeout (${timeout}s) exceeds recommended maximum of 60s`
            );
          }
        }
      ),
    },

    // Ensure Lambda functions have appropriate memory
    {
      name: "lambda-memory-limit",
      description: "Lambda functions should have reasonable memory allocation",
      enforcementLevel: "advisory",
      validateResource: policy.validateResourceOfType(
        "aws:lambda/function:Function",
        (args, reportViolation) => {
          const memorySize = (args.props as Record<string, unknown>)
            ?.memorySize as number;
          if (memorySize && memorySize > 1024) {
            reportViolation(
              `Lambda function memory (${memorySize}MB) exceeds recommended maximum of 1024MB`
            );
          }
        }
      ),
    },

    // Ensure EC2 instances are not using default VPC
    {
      name: "no-default-vpc",
      description: "EC2 resources should not use the default VPC",
      enforcementLevel: "advisory",
      validateResource: policy.validateResourceOfType(
        "aws:ec2/instance:Instance",
        (args, reportViolation) => {
          const subnetId = (args.props as Record<string, unknown>)
            ?.subnetId as string;
          if (!subnetId) {
            reportViolation(
              "EC2 instance should specify a subnet (not use default VPC)"
            );
          }
        }
      ),
    },

    // Ensure security groups don't allow unrestricted SSH access
    {
      name: "no-unrestricted-ssh",
      description: "Security groups should not allow unrestricted SSH access",
      enforcementLevel: "mandatory",
      validateResource: policy.validateResourceOfType(
        "aws:ec2/securityGroup:SecurityGroup",
        (args, reportViolation) => {
          const ingress = (args.props as Record<string, unknown>)?.ingress as
            | Array<{
                fromPort: number;
                toPort: number;
                cidrBlocks?: string[];
              }>
            | undefined;

          if (ingress) {
            for (const rule of ingress) {
              if (
                rule.fromPort <= 22 &&
                rule.toPort >= 22 &&
                rule.cidrBlocks?.includes("0.0.0.0/0")
              ) {
                reportViolation(
                  "Security group allows unrestricted SSH access (0.0.0.0/0 on port 22)"
                );
              }
            }
          }
        }
      ),
    },

    // Ensure ECR repositories have image scanning enabled
    {
      name: "ecr-scan-on-push",
      description: "ECR repositories should have scan-on-push enabled",
      enforcementLevel: "advisory",
      validateResource: policy.validateResourceOfType(
        "aws:ecr/repository:Repository",
        (args, reportViolation) => {
          const scanConfig = (args.props as Record<string, unknown>)
            ?.imageScanningConfiguration as { scanOnPush?: boolean } | undefined;
          if (!scanConfig?.scanOnPush) {
            reportViolation("ECR repository should have scan-on-push enabled");
          }
        }
      ),
    },

    // Ensure API Gateway has CORS configured
    {
      name: "api-gateway-cors",
      description: "API Gateway should have CORS configuration",
      enforcementLevel: "advisory",
      validateResource: policy.validateResourceOfType(
        "aws:apigatewayv2/api:Api",
        (args, reportViolation) => {
          const corsConfig = (args.props as Record<string, unknown>)
            ?.corsConfiguration;
          if (!corsConfig) {
            reportViolation("API Gateway should have CORS configuration");
          }
        }
      ),
    },
  ],
});

export default policyPack;




