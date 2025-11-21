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
  const { publicKey, userId, allowedIps } = body;

  if (!publicKey || !userId) {
    return { statusCode: 400, body: "Missing publicKey or userId" };
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
      },
    })
    .promise();

  console.log("[lambda] add-peer", { userId });

  return {
    statusCode: 200,
    body: JSON.stringify({ status: "peer_added" }),
  };
};


