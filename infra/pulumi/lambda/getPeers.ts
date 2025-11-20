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

  const peers = data.Items ?? [];

  console.log("[lambda] get-peers", { count: peers.length });

  return {
    statusCode: 200,
    body: JSON.stringify(peers),
  };
};


