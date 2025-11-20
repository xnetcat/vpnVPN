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

  console.log("[lambda] list-servers", { count: items.length });

  return {
    statusCode: 200,
    body: JSON.stringify(items),
  };
};


