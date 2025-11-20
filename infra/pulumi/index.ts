// @ts-nocheck
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

if (stack === "global") {
  const ecrRepoName = config.get("global:ecrRepoName") ?? "vpnvpn/rust-server";
  const repo = new aws.ecr.Repository("rust-server-repo", {
    name: ecrRepoName,
    imageScanningConfiguration: { scanOnPush: true },
    imageTagMutability: "MUTABLE",
    tags: { Project: "vpnvpn" },
  });

  ecrUri = repo.repositoryUrl;

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
  const maxInstances = config.getNumber("region:maxInstances") ?? 3;
  const instanceCpu = config.getNumber("region:instanceCpu") ?? 1024;
  const instanceMemory = config.getNumber("region:instanceMemory") ?? 2048;
  const adminCidr = config.get("region:adminCidr") ?? "0.0.0.0/0";
  const targetSessionsPerInstance =
    config.getNumber("region:targetSessionsPerInstance") ?? 100;

  const accountId = aws.getCallerIdentityOutput().accountId;
  const computedEcrUri = pulumi.interpolate`${accountId}.dkr.ecr.${regionName}.amazonaws.com/${ecrRepoName}:${imageTag}`;

  const instanceType =
    new pulumi.Config().get("region:instanceType") ?? "t3.medium";
  const pool = new VpnAsg("vpnvpn", {
    region: regionName,
    minInstances,
    maxInstances,
    imageUri: computedEcrUri,
    instanceType,
    adminCidr,
    targetSessionsPerInstance,
  });

  nlbDnsName = pool.nlbDnsName;
} else {
  throw new Error(`Unknown stack name: ${stack}`);
}

export { ecrUri, apiUrl, ampWorkspaceId, amgWorkspaceUrl, nlbDnsName };
