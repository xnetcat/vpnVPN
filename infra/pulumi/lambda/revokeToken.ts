import { DynamoDB } from "aws-sdk";

const ddb = new DynamoDB.DocumentClient();
const TOKENS_TABLE = process.env.TOKENS_TABLE!;
const WEB_API_KEY = process.env.WEB_API_KEY!;

export interface RevokeTokenEvent {
  pathParameters?: { token: string };
  headers?: Record<string, string>;
}

export const handler = async (event: RevokeTokenEvent) => {
  const headers = event.headers || {};
  const apiKey = headers["x-api-key"] || headers["X-Api-Key"];

  if (apiKey !== WEB_API_KEY) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const token = event.pathParameters?.token;
  if (!token) {
    return { statusCode: 400, body: "Missing token parameter" };
  }

  await ddb
    .update({
      TableName: TOKENS_TABLE,
      Key: { token },
      UpdateExpression: "SET active = :false",
      ExpressionAttributeValues: {
        ":false": false,
      },
    })
    .promise();

  console.log("[lambda] revoke-token", { token });

  return {
    statusCode: 200,
    body: JSON.stringify({ status: "revoked", token }),
  };
};

