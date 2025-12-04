import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VpnAsg } from "./components/vpnAsg";
import { ControlPlane } from "./controlPlane";
import { MetricsService } from "./metricsService";
import { Observability } from "./observability";
import { DnsValidatedCertificate } from "./components/certificate";

const config = new pulumi.Config();
const globalConfig = new pulumi.Config("global");
const regionConfig = new pulumi.Config("region");
const stack = pulumi.getStack();

// Outputs
let ecrUri: pulumi.Output<string> | undefined;
let controlPlaneApiUrl: pulumi.Output<string> | undefined;
let controlPlaneFunctionArn: pulumi.Output<string> | undefined;
let metricsApiUrl: pulumi.Output<string> | undefined;
let metricsFunctionArn: pulumi.Output<string> | undefined;
let ampWorkspaceId: pulumi.Output<string> | undefined;
let amgWorkspaceUrl: pulumi.Output<string> | undefined;
let nlbDnsName: pulumi.Output<string> | undefined;
let desktopBucketUrl: pulumi.Output<string> | undefined;
let lambdaCodeBucket: pulumi.Output<string> | undefined;

if (stack.startsWith("global")) {
  // ==========================================================================
  // Global Stack (us-east-1)
  // ==========================================================================

  const ecrRepoName = globalConfig.get("ecrRepoName") ?? "vpnvpn/rust-server";

  // ECR repository for vpn-server images
  const repo = new aws.ecr.Repository("rust-server-repo", {
    name: ecrRepoName,
    imageScanningConfiguration: { scanOnPush: true },
    imageTagMutability: "MUTABLE",
    tags: { Project: "vpnvpn" },
  });

  ecrUri = repo.repositoryUrl;

  // S3 bucket for desktop app downloads
  const desktopBucketName =
    globalConfig.get("desktopBucket") ?? "vpnvpn-desktop-releases";
  const desktopBucket = new aws.s3.Bucket("desktop-releases", {
    bucket: desktopBucketName,
    website: {
      indexDocument: "index.html",
    },
    corsRules: [
      {
        allowedHeaders: ["*"],
        allowedMethods: ["GET", "HEAD"],
        allowedOrigins: ["*"],
        maxAgeSeconds: 3600,
      },
    ],
    tags: { Project: "vpnvpn" },
  });

  // Explicitly allow public access
  const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(
    "desktop-releases-public-access",
    {
      bucket: desktopBucket.id,
      blockPublicAcls: false,
      blockPublicPolicy: false,
      ignorePublicAcls: false,
      restrictPublicBuckets: false,
    }
  );

  // Bucket policy for public read access
  new aws.s3.BucketPolicy(
    "desktop-releases-policy",
    {
      bucket: desktopBucket.id,
      policy: desktopBucket.arn.apply((arn) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "PublicReadGetObject",
              Effect: "Allow",
              Principal: "*",
              Action: "s3:GetObject",
              Resource: `${arn}/*`,
            },
          ],
        })
      ),
    },
    { dependsOn: [publicAccessBlock] }
  );

  desktopBucketUrl = pulumi.interpolate`https://${desktopBucket.bucketRegionalDomainName}`;

  // S3 bucket for Lambda deployment packages
  const codeBucketName =
    globalConfig.get("codeBucket") ?? "vpnvpn-lambda-deployments";
  const codeBucket = new aws.s3.Bucket("lambda-code", {
    bucket: codeBucketName,
    versioning: { enabled: true },
    tags: { Project: "vpnvpn" },
  });

  lambdaCodeBucket = codeBucket.bucket;

  // Database URL and API keys from config/secrets
  const databaseUrl = config.requireSecret("databaseUrl");
  const controlPlaneApiKey = config.requireSecret("controlPlaneApiKey");
  const bootstrapToken = config.getSecret("bootstrapToken");

  // ... (imports)

  // ... (inside global stack)

  // Custom Domain Configuration
  const domainName = globalConfig.get("domainName"); // e.g. api.vpnvpn.dev
  let certificateArn: pulumi.Input<string> | undefined =
    globalConfig.get("certificateArn");

  const metricsDomainName = globalConfig.get("metricsDomainName"); // e.g. metrics.vpnvpn.dev
  let metricsCertificateArn: pulumi.Input<string> | undefined =
    globalConfig.get("metricsCertificateArn");

  // If domains are set but certs are not, try to provision them automatically
  // We'll assume a wildcard cert `*.vpnvpn.dev` (or staging equivalent) is best,
  // but for now let's just provision individual certs for the specific domains requested
  // to avoid complexity with wildcard matching.

  if (domainName && !certificateArn) {
    const cert = new DnsValidatedCertificate("control-plane-cert", {
      domainName: domainName,
      // zoneId: ... (optional, defaults to looking up vpnvpn.dev.)
    });
    certificateArn = cert.certificateArn;
  }

  if (metricsDomainName && !metricsCertificateArn) {
    // If it's the same domain as control plane (unlikely for api vs metrics subdomains), reuse?
    // If we used a wildcard, we'd reuse.
    // For now, just create another cert. ACM certs are free.
    const cert = new DnsValidatedCertificate("metrics-cert", {
      domainName: metricsDomainName,
    });
    metricsCertificateArn = cert.certificateArn;
  }

  // Control Plane Lambda + API Gateway
  const controlPlaneCodeKey = globalConfig.get("controlPlaneCodeKey");
  const controlPlaneImageUri = globalConfig.get("controlPlaneImageUri");

  const cp = new ControlPlane("control-plane", {
    codeBucket: controlPlaneCodeKey ? codeBucket.bucket : undefined,
    codeKey: controlPlaneCodeKey,
    imageUri: controlPlaneImageUri,
    databaseUrl,
    apiKey: controlPlaneApiKey,
    bootstrapToken,
    domainName,
    certificateArn,
  });

  controlPlaneApiUrl = cp.apiUrl;
  controlPlaneFunctionArn = cp.functionArn;

  // Metrics Service Lambda + API Gateway
  const metricsCodeKey = globalConfig.get("metricsCodeKey");
  const metricsImageUri = globalConfig.get("metricsImageUri");

  const metrics = new MetricsService("metrics", {
    codeBucket: metricsCodeKey ? codeBucket.bucket : undefined,
    codeKey: metricsCodeKey,
    imageUri: metricsImageUri,
    databaseUrl,
    domainName: metricsDomainName,
    certificateArn: metricsCertificateArn,
  });

  metricsApiUrl = metrics.apiUrl;
  metricsFunctionArn = metrics.functionArn;

  // Observability (AMP/Grafana)
  const obs = new Observability("observability");
  ampWorkspaceId = obs.ampWorkspaceId;
  amgWorkspaceUrl = obs.amgWorkspaceUrl;
} else if (stack.startsWith("region-")) {
  // ==========================================================================
  // Regional Stack (e.g., region-us-east-1, region-eu-west-1)
  // ==========================================================================

  const regionName = aws.getRegionOutput().name;
  const ecrRepoName = globalConfig.get("ecrRepoName") ?? "vpnvpn/rust-server";
  const imageTag = regionConfig.require("imageTag");
  const minInstances = regionConfig.getNumber("minInstances") ?? 1;
  const maxInstances = regionConfig.getNumber("maxInstances") ?? 10;
  const desiredInstances = regionConfig.getNumber("desiredInstances");
  const adminCidr = regionConfig.get("adminCidr") ?? "0.0.0.0/0";
  const targetSessionsPerInstance =
    regionConfig.getNumber("targetSessionsPerInstance") ?? 100;
  const instanceType = regionConfig.get("instanceType") ?? "t3.medium";
  const vpnToken = regionConfig.requireSecret("vpnToken");

  const accountId = aws.getCallerIdentityOutput().accountId;
  const computedEcrUri = pulumi.interpolate`${accountId}.dkr.ecr.${regionName}.amazonaws.com/${ecrRepoName}:${imageTag}`;

  const pool = new VpnAsg("vpnvpn", {
    region: regionName,
    minInstances,
    maxInstances,
    desiredInstances,
    imageUri: computedEcrUri,
    instanceType,
    adminCidr,
    targetSessionsPerInstance,
    vpnToken,
  });

  nlbDnsName = pool.nlbDnsName;
} else {
  throw new Error(`Unknown stack name: ${stack}`);
}

// Exports
export {
  ecrUri,
  controlPlaneApiUrl,
  controlPlaneFunctionArn,
  metricsApiUrl,
  metricsFunctionArn,
  ampWorkspaceId,
  amgWorkspaceUrl,
  nlbDnsName,
  desktopBucketUrl,
  lambdaCodeBucket,
};
