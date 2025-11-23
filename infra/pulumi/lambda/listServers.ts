import { DynamoDB } from "aws-sdk";

const ddb = new DynamoDB.DocumentClient();
const SERVERS_TABLE = process.env.SERVERS_TABLE!;
const WEB_API_KEY = process.env.WEB_API_KEY!;

export interface ListServersEvent {
  headers?: Record<string, string>;
}

export const handler = async (event: ListServersEvent) => {
  const headers = event.headers || {};
  const apiKey = headers["x-api-key"] || headers["X-Api-Key"];

  if (apiKey !== WEB_API_KEY) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const data = await ddb
    .scan({
      TableName: SERVERS_TABLE,
    })
    .promise();

  const items = data.Items ?? [];

  const now = Date.now();

  const servers = items.map((item) => {
    const anyItem = item as any;
    const lastSeenIso: string | undefined = anyItem.lastSeen;
    let status = anyItem.status || "unknown";

    if (lastSeenIso) {
      const lastSeenMs = Date.parse(lastSeenIso);
      if (Number.isFinite(lastSeenMs)) {
        const diffMs = now - lastSeenMs;
        // Consider a server offline if it has not heartbeated in 5 minutes.
        if (diffMs > 5 * 60 * 1000) {
          status = "offline";
        } else if (!status || status === "unknown") {
          status = "online";
        }
      }
    }

    const metadata = anyItem.metadata || {};
    const metrics = anyItem.metrics || {};

    return {
      id: anyItem.id,
      publicIp: anyItem.publicIp,
      metadata,
      metrics,
      status,
      lastSeen: lastSeenIso,
      country: metadata.country,
      region: metadata.region,
    };
  });

  console.log("[lambda] list-servers", { count: servers.length });

  return {
    statusCode: 200,
    body: JSON.stringify(servers),
  };
};


