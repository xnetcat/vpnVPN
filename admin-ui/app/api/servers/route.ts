import { NextResponse } from "next/server";
import { requirePaidUser } from "@/lib/requirePaidUser";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
} from "@aws-sdk/client-autoscaling";
import {
  CloudWatchClient,
  GetMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";

type Server = {
  id: string;
  region: string;
  status: string;
  sessions: number;
  cpu: number;
};

export async function GET() {
  const gate = await requirePaidUser();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.reason },
      { status: gate.reason === "unauthenticated" ? 401 : 402 }
    );
  }
  try {
    const region =
      process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
    const asg = new AutoScalingClient({ region });
    const cw = new CloudWatchClient({ region });
    const ec2 = new EC2Client({ region });

    const groupsResp = await asg.send(new DescribeAutoScalingGroupsCommand({}));
    const groups = (groupsResp.AutoScalingGroups ?? []).filter((g) =>
      (g.Tags ?? []).some((t) => t.Key === "Project" && t.Value === "vpnvpn")
    );
    const instanceIds = groups
      .flatMap((g) => (g.Instances ?? []).map((i) => i.InstanceId!))
      .filter(Boolean);
    if (instanceIds.length === 0) {
      return NextResponse.json([]);
    }

    const instances = await ec2.send(
      new DescribeInstancesCommand({ InstanceIds: instanceIds as string[] })
    );
    const reservations = instances.Reservations ?? [];
    const allInstances = reservations.flatMap((r) => r.Instances ?? []);

    // Build CloudWatch metric queries for CPU and ActiveSessions
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 5 * 60 * 1000);
    const queries = [] as any[];
    for (const inst of allInstances) {
      const id = inst.InstanceId!;
      queries.push({
        Id: `cpu_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`.slice(0, 500),
        MetricStat: {
          Metric: {
            Namespace: "AWS/EC2",
            MetricName: "CPUUtilization",
            Dimensions: [{ Name: "InstanceId", Value: id }],
          },
          Period: 60,
          Stat: "Average",
        },
        ReturnData: true,
      });
      queries.push({
        Id: `sess_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`.slice(0, 500),
        MetricStat: {
          Metric: {
            Namespace: "vpnVPN",
            MetricName: "ActiveSessions",
            Dimensions: [{ Name: "InstanceId", Value: id }],
          },
          Period: 60,
          Stat: "Average",
        },
        ReturnData: true,
      });
    }
    const metricResp = await cw.send(
      new GetMetricDataCommand({
        StartTime: startTime,
        EndTime: endTime,
        MetricDataQueries: queries,
      })
    );
    const latest = new Map<string, number>();
    for (const r of metricResp.MetricDataResults ?? []) {
      const id = r.Id!;
      const vals = r.Values ?? [];
      const ts = r.Timestamps ?? [];
      if (vals.length > 0) {
        // pick most recent
        let idx = 0;
        if (ts.length > 1) {
          idx = ts.findIndex(
            (t) => t.getTime() === Math.max(...ts.map((d) => d.getTime()))
          );
        }
        latest.set(id, vals[idx] ?? 0);
      }
    }

    const servers: Server[] = allInstances.map((inst) => {
      const id = inst.InstanceId!;
      const asgName =
        groups.find((g) => (g.Instances ?? []).some((i) => i.InstanceId === id))
          ?.AutoScalingGroupName || "";
      const state = inst.State?.Name ?? "unknown";
      const cpu = latest.get(`cpu_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`) ?? 0;
      const sessions = Math.round(
        latest.get(`sess_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`) ?? 0
      );
      const az = inst.Placement?.AvailabilityZone ?? "";
      const regionOfInst = az.slice(0, -1);
      return {
        id,
        region: regionOfInst || region,
        status: state!,
        sessions,
        cpu,
      };
    });

    return NextResponse.json(servers);
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
