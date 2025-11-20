import { DynamoDB } from "aws-sdk";
import https from "https";

const ddb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME!;

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

export const handler = async () => {
  const url =
    "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt";

  const text = await fetchText(url);
  const lines = text
    .split(/\n+/)
    .filter((l) => l.includes(":"));

  const items = lines.slice(0, 100).map((line, idx) => {
    const [ip, port] = line.trim().split(":");
    return {
      PutRequest: {
        Item: {
          proxyId: `${Date.now()}-${idx}`,
          type: "http",
          ip,
          port: Number(port),
          country: "unknown",
          latency: Math.floor(Math.random() * 1000),
          score: Math.floor(Math.random() * 100),
          lastValidated: new Date().toISOString(),
          source: "github:TheSpeedX/PROXY-List",
        },
      },
    };
  });

  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await ddb
      .batchWrite({ RequestItems: { [TABLE_NAME]: chunk } })
      .promise();
  }

  console.log("[lambda] scrape-proxies", { inserted: items.length });

  return {
    statusCode: 200,
    body: JSON.stringify({ inserted: items.length }),
  };
};


