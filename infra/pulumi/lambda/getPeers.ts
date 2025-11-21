import { DynamoDB } from "aws-sdk";

const ddb = new DynamoDB.DocumentClient();
const PEERS_TABLE = process.env.PEERS_TABLE!;

export interface GetPeersEvent {
  // For future server-specific filtering we could use auth or query params.
}

export const handler = async (_event: GetPeersEvent) => {
  const data = await ddb
    .scan({
      TableName: PEERS_TABLE,
    })
    .promise();

  const items = data.Items ?? [];
  // Only return active peers; if `active` is missing, treat as active for backwards compatibility.
  const peers = items.filter((item) => (item as any).active !== false);

  console.log("[lambda] get-peers", { count: peers.length });

  return {
    statusCode: 200,
    body: JSON.stringify({ peers }),
  };
};


