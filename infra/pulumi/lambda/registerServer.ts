import { DynamoDB } from "aws-sdk";

const ddb = new DynamoDB.DocumentClient();

const SERVERS_TABLE = process.env.SERVERS_TABLE!;
const TOKENS_TABLE = process.env.TOKENS_TABLE!;

export interface RegisterEvent {
  body?: string;
}

export const handler = async (event: RegisterEvent) => {
  const body = JSON.parse(event.body || "{}");
  const { id, token, publicIp, metadata } = body;

  if (!id || !token) {
    return { statusCode: 400, body: "Missing id or token" };
  }

  const tokenRes = await ddb
    .get({
      TableName: TOKENS_TABLE,
      Key: { token },
    })
    .promise();

  if (!tokenRes.Item) {
    return { statusCode: 401, body: "Invalid token" };
  }

  // Check if token is active
  if ((tokenRes.Item as any).active === false) {
    return { statusCode: 401, body: "Token has been revoked" };
  }

  // Increment usage count
  await ddb
    .update({
      TableName: TOKENS_TABLE,
      Key: { token },
      UpdateExpression: "SET usageCount = if_not_exists(usageCount, :zero) + :inc",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":inc": 1,
      },
    })
    .promise();

  await ddb
    .put({
      TableName: SERVERS_TABLE,
      Item: {
        id,
        publicIp,
        metadata,
        status: "online",
        lastSeen: new Date().toISOString(),
      },
    })
    .promise();

  console.log("[lambda] register-server", { id });

  return {
    statusCode: 200,
    body: JSON.stringify({ status: "registered" }),
  };
};


