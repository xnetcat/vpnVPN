// @ts-nocheck
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

export interface VpnPoolArgs {
  region: string;
  minInstances: number;
  maxInstances: number;
  imageUri: string;
  instanceCpu?: number;
  instanceMemory?: number;
  adminCidr?: string;
}

export class VpnPool extends pulumi.ComponentResource {
  public readonly nlbDnsName: pulumi.Output<string>;

  constructor(
    name: string,
    args: VpnPoolArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("vpnvpn:components:VpnPool", name, {}, opts);

    const adminCidr = args.adminCidr ?? "0.0.0.0/0";

    const vpc = new awsx.ec2.Vpc(
      `${name}-vpc`,
      {
        numberOfAvailabilityZones: 2,
        natGateways: { strategy: "Single" },
        tags: { Project: "vpnvpn", Stack: pulumi.getStack() },
      },
      { parent: this }
    );

    const cluster = new aws.ecs.Cluster(
      `${name}-cluster`,
      {
        name: `${name}-cluster`,
        settings: [{ name: "containerInsights", value: "enabled" }],
        tags: { Project: "vpnvpn", Stack: pulumi.getStack() },
      },
      { parent: this }
    );

    const logGroup = new aws.cloudwatch.LogGroup(
      `${name}-logs`,
      {
        retentionInDays: 14,
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const taskExecRole = new aws.iam.Role(
      `${name}-exec-role`,
      {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
          Service: "ecs-tasks.amazonaws.com",
        }),
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-exec-attach`,
      {
        role: taskExecRole.name,
        policyArn: aws.iam.ManagedPolicies.AmazonECSTaskExecutionRolePolicy,
      },
      { parent: this }
    );

    const taskRole = new aws.iam.Role(
      `${name}-task-role`,
      {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
          Service: "ecs-tasks.amazonaws.com",
        }),
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const taskDef = new aws.ecs.TaskDefinition(
      `${name}-task`,
      {
        family: `${name}-task`,
        cpu: String(args.instanceCpu ?? 1024),
        memory: String(args.instanceMemory ?? 2048),
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        executionRoleArn: taskExecRole.arn,
        taskRoleArn: taskRole.arn,
        runtimePlatform: {
          cpuArchitecture: "X86_64",
          operatingSystemFamily: "LINUX",
        },
        containerDefinitions: pulumi.interpolate`[
        {
          "name": "vpn-server",
          "image": "${args.imageUri}",
          "essential": true,
          "linuxParameters": { "capabilities": { "add": ["NET_ADMIN"] } },
          "portMappings": [
            { "containerPort": 51820, "hostPort": 51820, "protocol": "udp" },
            { "containerPort": 8080, "hostPort": 8080, "protocol": "tcp" }
          ],
          "environment": [
            {"name": "LISTEN_UDP_PORT", "value": "51820"},
            {"name": "LISTEN_TCP_PORT", "value": "51820"},
            {"name": "ADMIN_PORT", "value": "8080"}
          ],
          "logConfiguration": {
            "logDriver": "awslogs",
            "options": {
              "awslogs-group": "${logGroup.name}",
              "awslogs-region": "${aws.config.region}",
              "awslogs-stream-prefix": "vpn-server"
            }
          }
        }
      ]`,
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const taskSg = new aws.ec2.SecurityGroup(
      `${name}-tasks-sg`,
      {
        vpcId: vpc.vpcId,
        ingress: [
          {
            protocol: "udp",
            fromPort: 51820,
            toPort: 51820,
            cidrBlocks: ["0.0.0.0/0"],
          },
          {
            protocol: "tcp",
            fromPort: 8080,
            toPort: 8080,
            cidrBlocks: [adminCidr],
          },
        ],
        egress: [
          { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
        ],
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const nlb = new aws.lb.LoadBalancer(
      `${name}-nlb`,
      {
        loadBalancerType: "network",
        subnets: vpc.publicSubnetIds,
        internal: false,
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const tgUdp = new aws.lb.TargetGroup(
      `${name}-tg-udp`,
      {
        port: 51820,
        protocol: "UDP",
        targetType: "ip",
        vpcId: vpc.vpcId,
        healthCheck: { protocol: "TCP", port: "8080" },
      },
      { parent: this }
    );

    const tgTcp = new aws.lb.TargetGroup(
      `${name}-tg-tcp`,
      {
        port: 8080,
        protocol: "TCP",
        targetType: "ip",
        vpcId: vpc.vpcId,
        healthCheck: { protocol: "TCP", port: "8080" },
      },
      { parent: this }
    );

    new aws.lb.Listener(
      `${name}-lis-udp`,
      {
        loadBalancerArn: nlb.arn,
        port: 51820,
        protocol: "UDP",
        defaultActions: [{ type: "forward", targetGroupArn: tgUdp.arn }],
      },
      { parent: this }
    );

    new aws.lb.Listener(
      `${name}-lis-tcp`,
      {
        loadBalancerArn: nlb.arn,
        port: 8080,
        protocol: "TCP",
        defaultActions: [{ type: "forward", targetGroupArn: tgTcp.arn }],
      },
      { parent: this }
    );

    const svc = new aws.ecs.Service(
      `${name}-svc`,
      {
        cluster: cluster.arn,
        taskDefinition: taskDef.arn,
        desiredCount: args.minInstances,
        launchType: "FARGATE",
        networkConfiguration: {
          subnets: vpc.privateSubnetIds,
          securityGroups: [taskSg.id],
          assignPublicIp: false,
        },
        loadBalancers: [
          {
            targetGroupArn: tgUdp.arn,
            containerName: "vpn-server",
            containerPort: 51820,
          },
          {
            targetGroupArn: tgTcp.arn,
            containerName: "vpn-server",
            containerPort: 8080,
          },
        ],
        deploymentCircuitBreaker: { enable: true, rollback: true },
        enableEcsManagedTags: true,
        propagateTags: "SERVICE",
        tags: { Project: "vpnvpn" },
      },
      { parent: this, dependsOn: [tgUdp, tgTcp] }
    );

    this.nlbDnsName = nlb.dnsName;

    this.registerOutputs({
      nlbDnsName: this.nlbDnsName,
      serviceName: svc.name,
    });
  }
}
