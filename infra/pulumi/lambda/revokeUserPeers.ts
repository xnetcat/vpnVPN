import { DynamoDB } from "aws-sdk";

const ddb = new DynamoDB.DocumentClient();
const PEERS_TABLE = process.env.PEERS_TABLE!;
const WEB_API_KEY = process.env.WEB_API_KEY!;

export interface RevokeUserPeersEvent {
  body?: string;
  headers?: Record<string, string>;
}

export const handler = async (event: RevokeUserPeersEvent) => {
  const headers = event.headers || {};
  const apiKey = headers["x-api-key"] || headers["X-Api-Key"];

  if (apiKey !== WEB_API_KEY) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const parsed = JSON.parse(event.body || "{}");
  const userId: string | undefined = parsed.userId;

  if (!userId) {
    return { statusCode: 400, body: "Missing userId" };
  }

  // Query peers for this user via GSI on userId.
  const data = await ddb
    .query({
      TableName: PEERS_TABLE,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    })
    .promise();

  const items = data.Items ?? [];

  if (!items.length) {
    console.log("[lambda] revoke-user-peers", { userId, revoked: 0 });
    return {
      statusCode: 200,
      body: JSON.stringify({ revoked: 0 }),
    };
  }

  // Mark all peers inactive; we keep the rows for auditability.
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

  console.log("[lambda] revoke-user-peers", {
    userId,
    revoked: items.length,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ revoked: items.length }),
  };
};


