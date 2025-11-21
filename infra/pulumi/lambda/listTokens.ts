import { DynamoDB } from "aws-sdk";

const ddb = new DynamoDB.DocumentClient();
const TOKENS_TABLE = process.env.TOKENS_TABLE!;
const WEB_API_KEY = process.env.WEB_API_KEY!;

export interface ListTokensEvent {
  headers?: Record<string, string>;
}

export const handler = async (event: ListTokensEvent) => {
  const headers = event.headers || {};
  const apiKey = headers["x-api-key"] || headers["X-Api-Key"];

  if (apiKey !== WEB_API_KEY) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const data = await ddb
    .scan({
      TableName: TOKENS_TABLE,
    })
    .promise();

  const items = data.Items ?? [];

  console.log("[lambda] list-tokens", { count: items.length });

  return {
    statusCode: 200,
    body: JSON.stringify(items),
  };
};

