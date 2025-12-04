import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as command from "@pulumi/command";
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
  let domainName = globalConfig.get("domainName");
  let certificateArn: pulumi.Input<string> | undefined =
    globalConfig.get("certificateArn");

  let metricsDomainName = globalConfig.get("metricsDomainName");
  let metricsCertificateArn: pulumi.Input<string> | undefined =
    globalConfig.get("metricsCertificateArn");

  // Automatically determine domains if not explicitly set
  if (!domainName) {
    if (stack.includes("staging")) {
      domainName = "api.staging.vpnvpn.dev";
    } else if (stack.includes("prod") || stack === "global") {
      domainName = "api.vpnvpn.dev";
    }
  }

  if (!metricsDomainName) {
    if (stack.includes("staging")) {
      metricsDomainName = "metrics.staging.vpnvpn.dev";
    } else if (stack.includes("prod") || stack === "global") {
      metricsDomainName = "metrics.vpnvpn.dev";
    }
  }

  // If domains are set but certs are not, try to provision them automatically
  if (domainName && !certificateArn) {
    const cert = new DnsValidatedCertificate("control-plane-cert", {
      domainName: domainName,
    });
    certificateArn = cert.certificateArn;
  }

  if (metricsDomainName && !metricsCertificateArn) {
    const cert = new DnsValidatedCertificate("metrics-cert", {
      domainName: metricsDomainName,
    });
    metricsCertificateArn = cert.certificateArn;
  }

  // Create Global DomainName resources (Static AWS Addresses)
  if (domainName && certificateArn) {
    new aws.apigatewayv2.DomainName("control-plane-domain", {
      domainName: domainName,
      domainNameConfiguration: {
        certificateArn: certificateArn,
        endpointType: "REGIONAL",
        securityPolicy: "TLS_1_2",
      },
      tags: { Project: "vpnvpn" },
    });
  }

  if (metricsDomainName && metricsCertificateArn) {
    new aws.apigatewayv2.DomainName("metrics-domain", {
      domainName: metricsDomainName,
      domainNameConfiguration: {
        certificateArn: metricsCertificateArn,
        endpointType: "REGIONAL",
        securityPolicy: "TLS_1_2",
      },
      tags: { Project: "vpnvpn" },
    });
  }

  // Control Plane Lambda + API Gateway
  // Create ECR Repo
  const controlPlaneRepo = new awsx.ecr.Repository("control-plane-repo", {
    forceDelete: true,
  });

  // Build and push Docker image using local command (awsx.ecr.Image was flaky)
  const controlPlaneImageTag = "latest"; // In real usage, use a hash or timestamp
  const controlPlaneImageUri = pulumi.interpolate`${controlPlaneRepo.url}:${controlPlaneImageTag}`;

  const controlPlaneBuild = new command.local.Command("control-plane-build", {
    create: pulumi.interpolate`
      aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${controlPlaneRepo.url}
      docker build -t ${controlPlaneImageUri} -f ../../services/control-plane/Dockerfile ../../
      docker push ${controlPlaneImageUri}
    `,
    // Triggers: run on every update for now to ensure latest code.
    // In production, you'd want to hash the source directory.
    triggers: [new Date().toISOString()],
  });

  const cp = new ControlPlane(
    "control-plane",
    {
      imageUri: controlPlaneImageUri,
      databaseUrl,
      apiKey: controlPlaneApiKey,
      bootstrapToken,
      domainName,
    },
    { dependsOn: [controlPlaneBuild] }
  );

  controlPlaneApiUrl = cp.apiUrl;
  controlPlaneFunctionArn = cp.functionArn;

  // Metrics Service Lambda + API Gateway
  // Create ECR Repo
  const metricsRepo = new awsx.ecr.Repository("metrics-repo", {
    forceDelete: true,
  });

  // Build and push Docker image using local command
  const metricsImageTag = "latest";
  const metricsImageUri = pulumi.interpolate`${metricsRepo.url}:${metricsImageTag}`;

  const metricsBuild = new command.local.Command(
    "metrics-build",
    {
      create: pulumi.interpolate`
      aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${metricsRepo.url}
      docker build -t ${metricsImageUri} -f ../../services/metrics/Dockerfile ../../
      docker push ${metricsImageUri}
    `,
      triggers: [new Date().toISOString()],
    },
    { dependsOn: [controlPlaneBuild] }
  ); // Serialize builds

  const metrics = new MetricsService(
    "metrics",
    {
      imageUri: metricsImageUri,
      databaseUrl,
      domainName: metricsDomainName,
    },
    { dependsOn: [metricsBuild] }
  );

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
