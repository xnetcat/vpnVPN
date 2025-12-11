import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as command from "@pulumi/command";

export interface VpnAsgArgs {
  region: pulumi.Input<string>;
  minInstances: number;
  maxInstances: number;
  desiredInstances?: number;
  imageUri: pulumi.Input<string>;
  instanceType?: string;
  adminCidr?: string;
  targetSessionsPerInstance?: number;
  vpnToken: pulumi.Input<string>;
  apiUrl: pulumi.Input<string>;
}

export class VpnAsg extends pulumi.ComponentResource {
  public readonly nlbDnsName: pulumi.Output<string>;

  constructor(
    name: string,
    args: VpnAsgArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("vpnvpn:components:VpnAsg", name, {}, opts);

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

    const sg = new aws.ec2.SecurityGroup(
      `${name}-sg`,
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
            protocol: "udp",
            fromPort: 1194,
            toPort: 1194,
            cidrBlocks: ["0.0.0.0/0"],
          },
          {
            protocol: "udp",
            fromPort: 500,
            toPort: 500,
            cidrBlocks: ["0.0.0.0/0"],
          },
          {
            protocol: "udp",
            fromPort: 4500,
            toPort: 4500,
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

    // NLB in public subnets, instance target mode
    const nlb = new aws.lb.LoadBalancer(
      `${name}-nlb`,
      {
        loadBalancerType: "network",
        subnets: vpc.publicSubnetIds,
        internal: false,
        enableCrossZoneLoadBalancing: true,
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const tgUdp = new aws.lb.TargetGroup(
      `${name}-tg-udp`,
      {
        port: 51820,
        protocol: "UDP",
        targetType: "instance",
        vpcId: vpc.vpcId,
        healthCheck: { protocol: "TCP", port: "8080" },
      },
      { parent: this }
    );

    const tgOpenvpn = new aws.lb.TargetGroup(
      `${name}-tg-ovpn`,
      {
        port: 1194,
        protocol: "UDP",
        targetType: "instance",
        vpcId: vpc.vpcId,
        healthCheck: { protocol: "TCP", port: "8080" },
      },
      { parent: this }
    );

    const tgIke500 = new aws.lb.TargetGroup(
      `${name}-tg-ike500`,
      {
        port: 500,
        protocol: "UDP",
        targetType: "instance",
        vpcId: vpc.vpcId,
        healthCheck: { protocol: "TCP", port: "8080" },
      },
      { parent: this }
    );

    const tgIke4500 = new aws.lb.TargetGroup(
      `${name}-tg-ike4500`,
      {
        port: 4500,
        protocol: "UDP",
        targetType: "instance",
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
        targetType: "instance",
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
      `${name}-lis-ovpn`,
      {
        loadBalancerArn: nlb.arn,
        port: 1194,
        protocol: "UDP",
        defaultActions: [{ type: "forward", targetGroupArn: tgOpenvpn.arn }],
      },
      { parent: this }
    );

    new aws.lb.Listener(
      `${name}-lis-ike500`,
      {
        loadBalancerArn: nlb.arn,
        port: 500,
        protocol: "UDP",
        defaultActions: [{ type: "forward", targetGroupArn: tgIke500.arn }],
      },
      { parent: this }
    );

    new aws.lb.Listener(
      `${name}-lis-ike4500`,
      {
        loadBalancerArn: nlb.arn,
        port: 4500,
        protocol: "UDP",
        defaultActions: [{ type: "forward", targetGroupArn: tgIke4500.arn }],
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

    // Instance role with ECR pull and SSM access
    const instanceRole = new aws.iam.Role(
      `${name}-instance-role`,
      {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
          Service: "ec2.amazonaws.com",
        }),
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-ecr-readonly`,
      {
        role: instanceRole.name,
        policyArn: aws.iam.ManagedPolicies.AmazonEC2ContainerRegistryReadOnly,
      },
      { parent: this }
    );
    new aws.iam.RolePolicyAttachment(
      `${name}-ssm-core`,
      {
        role: instanceRole.name,
        policyArn: aws.iam.ManagedPolicies.AmazonSSMManagedInstanceCore,
      },
      { parent: this }
    );
    new aws.iam.RolePolicyAttachment(
      `${name}-cw-agent`,
      {
        role: instanceRole.name,
        policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
      },
      { parent: this }
    );
    new aws.iam.RolePolicyAttachment(
      `${name}-asg-read`,
      {
        role: instanceRole.name,
        policyArn: "arn:aws:iam::aws:policy/AutoScalingReadOnlyAccess",
      },
      { parent: this }
    );

    const instanceProfile = new aws.iam.InstanceProfile(
      `${name}-instance-profile`,
      { role: instanceRole.name },
      { parent: this }
    );

    const accountId = aws.getCallerIdentityOutput().accountId;
    const regionName = aws.getRegionOutput().name;

    // Amazon Linux 2023 AMI (has native WireGuard support)
    const ami = aws.ec2.getAmiOutput({
      owners: ["137112412989"],
      mostRecent: true,
      filters: [{ name: "name", values: ["al2023-ami-2023.*-x86_64"] }],
    });

    const userData = pulumi.interpolate`#cloud-config
package_update: true
runcmd:
  - |
    set -euxo pipefail
    dnf install -y docker awscli
    systemctl enable docker
    systemctl start docker
    aws ecr get-login-password --region ${regionName} | docker login --username AWS --password-stdin ${accountId}.dkr.ecr.${regionName}.amazonaws.com
    INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
    ASG_NAME=$(aws autoscaling describe-auto-scaling-instances --instance-ids $INSTANCE_ID --query 'AutoScalingInstances[0].AutoScalingGroupName' --output text || echo "unknown")
    # Install and load WireGuard kernel module (AL2023 has native support)
    dnf install -y wireguard-tools
    modprobe wireguard || echo "WireGuard module load failed, container will use userspace"
    # Enable IP forwarding and NAT on host for VPN traffic
    sysctl -w net.ipv4.ip_forward=1
    iptables -t nat -C POSTROUTING -o eth0 -j MASQUERADE || iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
    docker pull ${args.imageUri}
    mkdir -p /dev/net || true
    if [ ! -c /dev/net/tun ]; then
      mknod /dev/net/tun c 10 200 || true
    fi
    docker run -d --name vpn-server --restart=always \
      --network host \
      --cap-add=NET_ADMIN \
      --device /dev/net/tun:/dev/net/tun \
      -v /lib/modules:/lib/modules:ro \
      -e LISTEN_UDP_PORT=51820 -e LISTEN_TCP_PORT=51820 -e ADMIN_PORT=8080 \
      -e OPENVPN_PORT=1194 -e VPN_PROTOCOLS="wireguard,openvpn,ikev2" \
      -e INSTANCE_ID="$INSTANCE_ID" -e ASG_NAME="$ASG_NAME" -e AWS_REGION="${regionName}" \
      -e VPN_TOKEN="${args.vpnToken}" \
      -e API_URL="${args.apiUrl}" \
      ${args.imageUri}
`;

    const lt = new aws.ec2.LaunchTemplate(
      `${name}-lt`,
      {
        imageId: ami.id,
        instanceType: args.instanceType ?? "t3.medium",
        updateDefaultVersion: true,
        iamInstanceProfile: { arn: instanceProfile.arn },
        networkInterfaces: [
          {
            deviceIndex: 0,
            associatePublicIpAddress: "true",
            securityGroups: [sg.id],
          },
        ],
        userData: userData.apply((d) => Buffer.from(d).toString("base64")),
        blockDeviceMappings: [
          {
            deviceName: "/dev/xvda",
            ebs: {
              deleteOnTermination: "true",
              volumeSize: 12,
              volumeType: "gp3",
            },
          },
        ],
        tagSpecifications: [
          { resourceType: "instance", tags: { Project: "vpnvpn" } },
          { resourceType: "volume", tags: { Project: "vpnvpn" } },
        ],
      },
      { parent: this }
    );

    const asg = new aws.autoscaling.Group(
      `${name}-asg`,
      {
        desiredCapacity: args.desiredInstances ?? args.minInstances,
        minSize: args.minInstances,
        maxSize: args.maxInstances,
        vpcZoneIdentifiers: vpc.publicSubnetIds,
        launchTemplate: { id: lt.id, version: "$Latest" },
        targetGroupArns: [
          tgUdp.arn,
          tgOpenvpn.arn,
          tgIke500.arn,
          tgIke4500.arn,
          tgTcp.arn,
        ],
        tags: [
          { key: "Project", value: "vpnvpn", propagateAtLaunch: true },
          { key: "Stack", value: pulumi.getStack(), propagateAtLaunch: true },
        ],
      },
      { parent: this }
    );

    // Roll instances when the launch template (image) changes
    new command.local.Command(
      `${name}-instance-refresh`,
      {
        create: pulumi.interpolate`aws autoscaling start-instance-refresh --auto-scaling-group-name ${asg.name} --strategy Rolling --preferences '{"MinHealthyPercentage":90,"InstanceWarmup":120,"SkipMatching":true}'`,
        triggers: [lt.latestVersion],
      },
      { parent: this, dependsOn: [lt, asg] }
    );

    // Simple CPU target-tracking autoscaling
    const targetSessions = args.targetSessionsPerInstance ?? 100;

    new aws.autoscaling.Policy(
      `${name}-sessions-tt`,
      {
        autoscalingGroupName: asg.name,
        policyType: "TargetTrackingScaling",
        targetTrackingConfiguration: {
          customizedMetricSpecification: {
            metricName: "ActiveSessions",
            namespace: "vpnVPN",
            statistic: "Average",
            // Newer Pulumi aws types model dimensions implicitly via math expressions.
            // We fall back to a simple metric for the whole ASG.
            unit: "Count" as any,
          },
          targetValue: targetSessions,
        },
      },
      { parent: this }
    );

    this.nlbDnsName = nlb.dnsName;

    this.registerOutputs({ nlbDnsName: this.nlbDnsName });
  }
}
