import { DynamoDB } from "aws-sdk";

const ddb = new DynamoDB.DocumentClient();
const SERVERS_TABLE = process.env.SERVERS_TABLE!;

export interface HeartbeatEvent {
  body?: string;
}

export const handler = async (event: HeartbeatEvent) => {
  const body = JSON.parse(event.body || "{}");
  const { id, metrics } = body;

  if (!id) {
    return { statusCode: 400, body: "Missing id" };
  }

  try {
    await ddb
      .update({
        TableName: SERVERS_TABLE,
        Key: { id },
        UpdateExpression: "set metrics = :m, lastSeen = :t, #s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":m": metrics || {},
          ":t": new Date().toISOString(),
          ":s": "online",
        },
      })
      .promise();

    console.log("[lambda] heartbeat-server", { id });

    return { statusCode: 200, body: JSON.stringify({ status: "ok" }) };
  } catch (e) {
    console.error("[lambda] heartbeat-server error", { e, id });
    return { statusCode: 500, body: "Error updating heartbeat" };
  }
};


