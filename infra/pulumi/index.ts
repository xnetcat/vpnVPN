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
let metricsApiUrl: pulumi.Output<string> | undefined;
let ampWorkspaceId: pulumi.Output<string> | undefined;
let nlbDnsName: pulumi.Output<string> | undefined;
let desktopBucketUrl: pulumi.Output<string> | undefined;
let lambdaCodeBucket: pulumi.Output<string> | undefined;
let controlPlaneDomainTarget: pulumi.Output<string> | undefined;
let metricsDomainTarget: pulumi.Output<string> | undefined;

if (stack.startsWith("global")) {
  // ==========================================================================
  // Global Stack (us-east-1)
  // ==========================================================================

  const ecrRepoName = globalConfig.get("ecrRepoName") ?? "vpnvpn/rust-server";
  const envName =
    stack.includes("prod") || stack.includes("production")
      ? "production"
      : "staging";
  const envTag = `${envName}-latest`;

  // ECR repository for vpn-server images
  const repo = new aws.ecr.Repository("rust-server-repo", {
    name: ecrRepoName,
    imageScanningConfiguration: { scanOnPush: true },
    imageTagMutability: "MUTABLE",
    forceDelete: true,
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
  let controlPlaneDomain: aws.apigatewayv2.DomainName | undefined;
  if (domainName && certificateArn) {
    controlPlaneDomain = new aws.apigatewayv2.DomainName(
      "control-plane-domain",
      {
        domainName: domainName,
        domainNameConfiguration: {
          certificateArn: certificateArn,
          endpointType: "REGIONAL",
          securityPolicy: "TLS_1_2",
        },
        tags: { Project: "vpnvpn" },
      }
    );
    controlPlaneDomainTarget = controlPlaneDomain.domainNameConfiguration.apply(
      (c) => c.targetDomainName
    );
  }

  let metricsDomain: aws.apigatewayv2.DomainName | undefined;
  if (metricsDomainName && metricsCertificateArn) {
    metricsDomain = new aws.apigatewayv2.DomainName("metrics-domain", {
      domainName: metricsDomainName,
      domainNameConfiguration: {
        certificateArn: metricsCertificateArn,
        endpointType: "REGIONAL",
        securityPolicy: "TLS_1_2",
      },
      tags: { Project: "vpnvpn" },
    });
    metricsDomainTarget = metricsDomain.domainNameConfiguration.apply(
      (c) => c.targetDomainName
    );
  }

  // Control Plane Lambda + API Gateway
  // Create ECR Repo
  const controlPlaneRepo = new aws.ecr.Repository("control-plane-repo", {
    forceDelete: true,
    tags: { Project: "vpnvpn" },
  });

  // Build and push Docker image using local command (awsx.ecr.Image was flaky)
  const buildId =
    process.env.SERVICE_BUILD_ID ??
    process.env.GITHUB_SHA ??
    new Date().getTime().toString();
  const awsRegion = process.env.AWS_REGION ?? "us-east-1";
  const controlPlaneImageTag = `build-${buildId}`;
  const controlPlaneEnvTag = `${envTag}`;
  const controlPlaneImageUri = pulumi.interpolate`${controlPlaneRepo.repositoryUrl}:${controlPlaneImageTag}`;

  const controlPlaneBuild = new command.local.Command("control-plane-build", {
    create: pulumi.interpolate`
      aws ecr get-login-password --region ${awsRegion} | docker login --username AWS --password-stdin ${controlPlaneRepo.repositoryUrl}
      docker build --no-cache --platform linux/amd64 --provenance=false -t ${controlPlaneImageUri} -f ../../services/control-plane/Dockerfile ../../
      docker push ${controlPlaneImageUri}
      docker tag ${controlPlaneImageUri} ${controlPlaneRepo.repositoryUrl}:${controlPlaneEnvTag}
      docker push ${controlPlaneRepo.repositoryUrl}:${controlPlaneEnvTag}
    `,
    // Triggers: run on every update for now to ensure latest code.
    triggers: [buildId],
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
    {
      dependsOn: [controlPlaneBuild, controlPlaneDomain].filter(
        (x) => !!x
      ) as pulumi.Resource[],
    }
  );

  controlPlaneApiUrl = cp.apiUrl;
  controlPlaneApiUrl = cp.apiUrl;

  // Metrics Service Lambda + API Gateway
  // Create ECR Repo
  const metricsRepo = new aws.ecr.Repository("metrics-repo", {
    forceDelete: true,
    tags: { Project: "vpnvpn" },
  });

  // Build and push Docker image using local command
  const metricsImageTag = `build-${buildId}`;
  const metricsEnvTag = `${envTag}`;
  const metricsImageUri = pulumi.interpolate`${metricsRepo.repositoryUrl}:${metricsImageTag}`;

  const metricsBuild = new command.local.Command(
    "metrics-build",
    {
      create: pulumi.interpolate`
        aws ecr get-login-password --region ${awsRegion} | docker login --username AWS --password-stdin ${metricsRepo.repositoryUrl}
        docker build --no-cache --platform linux/amd64 --provenance=false -t ${metricsImageUri} -f ../../services/metrics/Dockerfile ../../
        docker push ${metricsImageUri}
        docker tag ${metricsImageUri} ${metricsRepo.repositoryUrl}:${metricsEnvTag}
        docker push ${metricsRepo.repositoryUrl}:${metricsEnvTag}
      `,
      triggers: [buildId],
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
    {
      dependsOn: [metricsBuild, metricsDomain].filter(
        (x) => !!x
      ) as pulumi.Resource[],
    }
  );

  metricsApiUrl = metrics.apiUrl;
  metricsApiUrl = metrics.apiUrl;

  // vpn-server image (for regional ASGs)
  const vpnServerImageTagValue = `build-${buildId}`;
  const vpnServerEnvTag = `${envTag}`;
  const vpnServerImageUri = pulumi.interpolate`${repo.repositoryUrl}:${vpnServerImageTagValue}`;

  const vpnServerBuild = new command.local.Command("vpn-server-build", {
    create: pulumi.interpolate`
      aws ecr get-login-password --region ${awsRegion} | docker login --username AWS --password-stdin ${repo.repositoryUrl}
      docker build --no-cache --platform linux/amd64 --provenance=false -t ${vpnServerImageUri} -f ../../apps/vpn-server/Dockerfile ../../apps/vpn-server
      docker push ${vpnServerImageUri}
      docker tag ${vpnServerImageUri} ${repo.repositoryUrl}:${vpnServerEnvTag}
      docker push ${repo.repositoryUrl}:${vpnServerEnvTag}
    `,
    triggers: [buildId],
  });

  // Observability (AMP/Grafana)
  const obs = new Observability("observability");
  ampWorkspaceId = obs.ampWorkspaceId;
} else if (stack.startsWith("region-")) {
  // ==========================================================================
  // Regional Stack (e.g., region-us-east-1, region-eu-west-1)
  // ==========================================================================

  const regionName = aws.getRegionOutput().name;
  const ecrRepoName = globalConfig.get("ecrRepoName") ?? "vpnvpn/rust-server";

  const org = pulumi.getOrganization();
  const project = pulumi.getProject();
  const env = stack.split("-").pop(); // e.g. region-us-east-1-staging -> staging
  const globalStackName = `${org}/${project}/global-${env}`;
  const globalStack = new pulumi.StackReference(globalStackName);

  const envTag = `${env}-latest`;
  const imageTag =
    (regionConfig.get("imageTag") as string | undefined) ?? envTag;
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

  // Get global stack reference for API URL
  const apiUrl = globalStack.getOutput("controlPlaneApiUrl");

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
    apiUrl: apiUrl as pulumi.Input<string>,
  });

  nlbDnsName = pool.nlbDnsName;
} else {
  throw new Error(`Unknown stack name: ${stack}`);
}

// Exports - only export defined values to avoid warnings
export const outputs = {
  ...(ecrUri && { ecrUri }),
  ...(controlPlaneApiUrl && { controlPlaneApiUrl }),
  ...(metricsApiUrl && { metricsApiUrl }),
  ...(ampWorkspaceId && { ampWorkspaceId }),
  ...(nlbDnsName && { nlbDnsName }),
  ...(desktopBucketUrl && { desktopBucketUrl }),
  ...(lambdaCodeBucket && { lambdaCodeBucket }),
  ...(controlPlaneDomainTarget && { controlPlaneDomainTarget }),
  ...(metricsDomainTarget && { metricsDomainTarget }),
};

// Re-export individually for backward compatibility
export {
  ecrUri,
  controlPlaneApiUrl,
  metricsApiUrl,
  ampWorkspaceId,
  nlbDnsName,
  desktopBucketUrl,
  lambdaCodeBucket,
  controlPlaneDomainTarget,
  metricsDomainTarget,
};
