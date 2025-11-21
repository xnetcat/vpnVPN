import { DynamoDB } from "aws-sdk";

const ddb = new DynamoDB.DocumentClient();
const PEERS_TABLE = process.env.PEERS_TABLE!;
const WEB_API_KEY = process.env.WEB_API_KEY!;

export interface RevokePeerEvent {
  pathParameters?: { publicKey: string };
  headers?: Record<string, string>;
}

export const handler = async (event: RevokePeerEvent) => {
  const headers = event.headers || {};
  const apiKey = headers["x-api-key"] || headers["X-Api-Key"];

  if (apiKey !== WEB_API_KEY) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const publicKey = event.pathParameters?.publicKey;
  if (!publicKey) {
    return { statusCode: 400, body: "Missing publicKey parameter" };
  }

  // Set the peer as inactive instead of deleting
  await ddb
    .update({
      TableName: PEERS_TABLE,
      Key: { publicKey },
      UpdateExpression: "SET active = :false",
      ExpressionAttributeValues: {
        ":false": false,
      },
    })
    .promise();

  console.log("[lambda] revoke-peer", { publicKey });

  return {
    statusCode: 200,
    body: JSON.stringify({ status: "revoked", publicKey }),
  };
};

