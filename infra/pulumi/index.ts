import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { VpnPool } from "./components/vpnPool";
import { VpnAsg } from "./components/vpnAsg";
import { ControlPlane } from "./controlPlane";
import { Observability } from "./observability";

const config = new pulumi.Config();
const stack = pulumi.getStack();

let ecrUri: pulumi.Output<string> | undefined;
let apiUrl: pulumi.Output<string> | undefined;
let ampWorkspaceId: pulumi.Output<string> | undefined;
let amgWorkspaceUrl: pulumi.Output<string> | undefined;
let nlbDnsName: pulumi.Output<string> | undefined;
let desktopBucketUrl: pulumi.Output<string> | undefined;

if (stack === "global") {
  const ecrRepoName = config.get("global:ecrRepoName") ?? "vpnvpn/rust-server";
  const repo = new aws.ecr.Repository("rust-server-repo", {
    name: ecrRepoName,
    imageScanningConfiguration: { scanOnPush: true },
    imageTagMutability: "MUTABLE",
    tags: { Project: "vpnvpn" },
  });

  ecrUri = repo.repositoryUrl;

  // S3 bucket for desktop app downloads
  const desktopBucketName =
    config.get("global:desktopBucket") ?? "vpnvpn-desktop-releases";
  const desktopBucket = new aws.s3.Bucket("desktop-releases", {
    bucket: desktopBucketName,
    acl: "public-read",
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

  // Bucket policy for public read access
  new aws.s3.BucketPolicy("desktop-releases-policy", {
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
  });

  desktopBucketUrl = pulumi.interpolate`https://${desktopBucket.bucketRegionalDomainName}`;

  const cp = new ControlPlane("control-plane");
  apiUrl = cp.apiUrl;

  const obs = new Observability("observability");
  ampWorkspaceId = obs.ampWorkspaceId;
  amgWorkspaceUrl = obs.amgWorkspaceUrl;
} else if (stack.startsWith("region-")) {
  const regionName = aws.getRegionOutput().name;
  const ecrRepoName = config.get("global:ecrRepoName") ?? "vpnvpn/rust-server";
  const imageTag = config.require("region:imageTag");
  const minInstances = config.getNumber("region:minInstances") ?? 1;
  const maxInstances = config.getNumber("region:maxInstances") ?? 10;
  const desiredInstances = config.getNumber("region:desiredInstances");
  const adminCidr = config.get("region:adminCidr") ?? "0.0.0.0/0";
  const targetSessionsPerInstance =
    config.getNumber("region:targetSessionsPerInstance") ?? 100;

  const accountId = aws.getCallerIdentityOutput().accountId;
  const computedEcrUri = pulumi.interpolate`${accountId}.dkr.ecr.${regionName}.amazonaws.com/${ecrRepoName}:${imageTag}`;

  const instanceType = config.get("region:instanceType") ?? "t3.medium";
  const pool = new VpnAsg("vpnvpn", {
    region: regionName,
    minInstances,
    maxInstances,
    desiredInstances,
    imageUri: computedEcrUri,
    instanceType,
    adminCidr,
    targetSessionsPerInstance,
  });

  nlbDnsName = pool.nlbDnsName;
} else {
  throw new Error(`Unknown stack name: ${stack}`);
}

export {
  ecrUri,
  apiUrl,
  ampWorkspaceId,
  amgWorkspaceUrl,
  nlbDnsName,
  desktopBucketUrl,
};
