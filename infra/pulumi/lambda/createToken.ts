import { DynamoDB } from "aws-sdk";
import { randomBytes } from "crypto";

const ddb = new DynamoDB.DocumentClient();
const TOKENS_TABLE = process.env.TOKENS_TABLE!;
const WEB_API_KEY = process.env.WEB_API_KEY!;

export interface CreateTokenEvent {
  body?: string;
  headers?: Record<string, string>;
}

export const handler = async (event: CreateTokenEvent) => {
  const headers = event.headers || {};
  const apiKey = headers["x-api-key"] || headers["X-Api-Key"];

  if (apiKey !== WEB_API_KEY) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body || "{}");
  const { label } = body;

  // Generate a secure random token
  const token = randomBytes(32).toString("hex");

  await ddb
    .put({
      TableName: TOKENS_TABLE,
      Item: {
        token,
        label: label || "Unlabeled Token",
        createdAt: new Date().toISOString(),
        usageCount: 0,
        active: true,
      },
    })
    .promise();

  console.log("[lambda] create-token", { label });

  return {
    statusCode: 200,
    body: JSON.stringify({ token, label }),
  };
};

