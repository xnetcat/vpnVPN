import { DynamoDB } from "aws-sdk";

const ddb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME!;

export interface ListProxiesEvent {
  // no body
}

export const handler = async (_event: ListProxiesEvent) => {
  const data = await ddb
    .scan({ TableName: TABLE_NAME, Limit: 50 })
    .promise();

  const items = data.Items ?? [];

  console.log("[lambda] list-proxies", { count: items.length });

  return { statusCode: 200, body: JSON.stringify(items) };
};


