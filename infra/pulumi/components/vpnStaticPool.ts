import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

export interface VpnStaticPoolArgs {
  region: pulumi.Input<string>;
  instanceCount: number;
  imageUri: pulumi.Input<string>;
  instanceType?: string;
  adminCidr?: string;
  vpnToken: pulumi.Input<string>;
  apiUrl: pulumi.Input<string>;
}

export class VpnStaticPool extends pulumi.ComponentResource {
  public readonly instancePublicIps: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: VpnStaticPoolArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("vpnvpn:components:VpnStaticPool", name, {}, opts);

    const adminCidr = args.adminCidr ?? "0.0.0.0/0";

    // VPC with public subnets only (no need for NAT gateway without private subnets)
    const vpc = new awsx.ec2.Vpc(
      `${name}-vpc`,
      {
        numberOfAvailabilityZones: 2,
        natGateways: { strategy: "None" },
        subnetStrategy: "Auto",
        subnetSpecs: [{ type: awsx.ec2.SubnetType.Public, cidrMask: 24 }],
        tags: { Project: "vpnvpn", Stack: pulumi.getStack() },
      },
      { parent: this }
    );

    // Security group for VPN instances
    const sg = new aws.ec2.SecurityGroup(
      `${name}-sg`,
      {
        vpcId: vpc.vpcId,
        ingress: [
          // WireGuard
          {
            protocol: "udp",
            fromPort: 51820,
            toPort: 51820,
            cidrBlocks: ["0.0.0.0/0"],
          },
          // OpenVPN
          {
            protocol: "udp",
            fromPort: 1194,
            toPort: 1194,
            cidrBlocks: ["0.0.0.0/0"],
          },
          // IKEv2/IPsec
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
          // Admin/Health check
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

    const instanceProfile = new aws.iam.InstanceProfile(
      `${name}-instance-profile`,
      { role: instanceRole.name },
      { parent: this }
    );

    const accountId = aws.getCallerIdentityOutput().accountId;
    const regionName = aws.getRegionOutput().name;

    // Amazon Linux 2 AMI (Kernel 5.10)
    const ami = aws.ec2.getAmiOutput({
      owners: ["137112412989"],
      mostRecent: true,
      filters: [
        { name: "name", values: ["amzn2-ami-kernel-5.10-hvm-*-x86_64-gp2"] },
      ],
    });

    // User data script for VPN server setup
    const userData = pulumi.interpolate`#!/bin/bash
set -euxo pipefail

# AL2 Setup
yum update -y
amazon-linux-extras install -y docker
systemctl enable docker
systemctl start docker
usermod -a -G docker ec2-user

# Install WireGuard tools (requires EPEL on AL2)
amazon-linux-extras install -y epel
curl -Lo /etc/yum.repos.d/wireguard.repo https://copr.fedorainfracloud.org/coprs/jdoss/wireguard/repo/epel-7/jdoss-wireguard-epel-7.repo
yum install -y wireguard-tools

modprobe wireguard || echo "WireGuard module load failed"

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install

# ECR Login
aws ecr get-login-password --region ${regionName} | docker login --username AWS --password-stdin ${accountId}.dkr.ecr.${regionName}.amazonaws.com

INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)

# Detect default interface
DEFAULT_IFACE=$(ip route | grep default | awk '{print $5}')
if [ -z "$DEFAULT_IFACE" ]; then
  DEFAULT_IFACE="eth0"
  echo "Warning: Could not detect default interface, falling back to eth0"
fi
echo "Detected default interface: $DEFAULT_IFACE"

# Enable IP forwarding
sysctl -w net.ipv4.ip_forward=1
# Disable Reverse Path Filtering
sysctl -w net.ipv4.conf.all.rp_filter=0
sysctl -w net.ipv4.conf.default.rp_filter=0

# Configure NAT/Masquerading
iptables -F
iptables -t nat -F
iptables -P FORWARD ACCEPT
iptables -P INPUT ACCEPT
iptables -P OUTPUT ACCEPT

# Add MASQUERADE rule for the default interface
iptables -t nat -A POSTROUTING -o $DEFAULT_IFACE -j MASQUERADE

# Allow traffic from VPN interfaces
iptables -I INPUT 1 -i wg0 -j ACCEPT
iptables -I INPUT 1 -i tun0 -j ACCEPT

# Allow forwarding from VPN to WAN and back
iptables -I FORWARD 1 -i wg0 -j ACCEPT
iptables -I FORWARD 1 -i tun0 -j ACCEPT
iptables -I FORWARD 1 -o $DEFAULT_IFACE -j ACCEPT
iptables -I FORWARD 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

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
  -e INSTANCE_ID="$INSTANCE_ID" -e AWS_REGION="${regionName}" \
  -e VPN_TOKEN="${args.vpnToken}" \
  -e API_URL="${args.apiUrl}" \
  ${args.imageUri}
`;

    // Create fixed EC2 instances with Elastic IPs
    const instances: aws.ec2.Instance[] = [];
    const eips: aws.ec2.Eip[] = [];

    for (let i = 0; i < args.instanceCount; i++) {
      const instance = new aws.ec2.Instance(
        `${name}-instance-${i}`,
        {
          ami: ami.id,
          instanceType: args.instanceType ?? "t3.medium",
          subnetId: vpc.publicSubnetIds.apply((ids) => ids[i % ids.length]),
          vpcSecurityGroupIds: [sg.id],
          iamInstanceProfile: instanceProfile.name,
          userData: userData,
          userDataReplaceOnChange: true,
          rootBlockDevice: {
            volumeSize: 12,
            volumeType: "gp3",
            deleteOnTermination: true,
          },
          tags: {
            Name: `${name}-vpn-node-${i}`,
            Project: "vpnvpn",
            Stack: pulumi.getStack(),
          },
        },
        { parent: this }
      );
      instances.push(instance);

      // Elastic IP for stable public address
      const eip = new aws.ec2.Eip(
        `${name}-eip-${i}`,
        {
          instance: instance.id,
          domain: "vpc",
          tags: {
            Name: `${name}-vpn-node-${i}`,
            Project: "vpnvpn",
          },
        },
        { parent: this }
      );
      eips.push(eip);
    }

    // Collect all public IPs
    this.instancePublicIps = pulumi.all(eips.map((eip) => eip.publicIp));

    this.registerOutputs({
      instancePublicIps: this.instancePublicIps,
    });
  }
}
