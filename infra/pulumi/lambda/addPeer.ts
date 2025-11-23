import { DynamoDB } from "aws-sdk";

const ddb = new DynamoDB.DocumentClient();
const PEERS_TABLE = process.env.PEERS_TABLE!;
const WEB_API_KEY = process.env.WEB_API_KEY!;

export interface AddPeerEvent {
  body?: string;
  headers?: Record<string, string>;
}

export const handler = async (event: AddPeerEvent) => {
  const headers = event.headers || {};
  const apiKey = headers["x-api-key"] || headers["X-Api-Key"];

  if (apiKey !== WEB_API_KEY) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const {
    publicKey,
    userId,
    allowedIps,
    serverId,
    country,
    region,
  }: {
    publicKey?: string;
    userId?: string;
    allowedIps?: string[];
    serverId?: string;
    country?: string;
    region?: string;
  } = body;

  if (!publicKey || !userId) {
    return { statusCode: 400, body: "Missing publicKey or userId" };
  }

  // Ensure only one active peer per user by marking existing peers inactive.
  // We intentionally keep historical rows for auditability.
  const existing = await ddb
    .query({
      TableName: PEERS_TABLE,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    })
    .promise();

  const items = existing.Items ?? [];
  if (items.length > 0) {
    await Promise.all(
      items.map((item) =>
        ddb
          .update({
            TableName: PEERS_TABLE,
            Key: { publicKey: (item as any).publicKey },
            UpdateExpression: "SET #a = :false, revokedAt = :now",
            ExpressionAttributeNames: { "#a": "active" },
            ExpressionAttributeValues: {
              ":false": false,
              ":now": new Date().toISOString(),
            },
          })
          .promise()
      )
    );
  }

  await ddb
    .put({
      TableName: PEERS_TABLE,
      Item: {
        publicKey,
        userId,
        allowedIps: allowedIps || [],
        createdAt: new Date().toISOString(),
        active: true,
        serverId,
        country,
        region,
      },
    })
    .promise();

  console.log("[lambda] add-peer", {
    userId,
    serverId,
    hadPreviousPeers: items.length > 0,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ status: "peer_added" }),
  };
};

