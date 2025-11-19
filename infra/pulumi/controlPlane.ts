import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export class ControlPlane extends pulumi.ComponentResource {
  public readonly apiUrl: pulumi.Output<string>;

  constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
    super("vpnvpn:components:ControlPlane", name, {}, opts);

    const config = new pulumi.Config();
    const webApiKey = config.get("webApiKey") || "dev-secret-key";

    // --- DynamoDB Tables ---

    const proxyTable = new aws.dynamodb.Table(
      `${name}-proxies`,
      {
        attributes: [{ name: "proxyId", type: "S" }],
        hashKey: "proxyId",
        billingMode: "PAY_PER_REQUEST",
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const vpnServersTable = new aws.dynamodb.Table(
      `${name}-vpn-servers`,
      {
        attributes: [{ name: "id", type: "S" }],
        hashKey: "id",
        billingMode: "PAY_PER_REQUEST",
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const vpnPeersTable = new aws.dynamodb.Table(
      `${name}-vpn-peers`,
      {
        attributes: [{ name: "publicKey", type: "S" }],
        hashKey: "publicKey",
        billingMode: "PAY_PER_REQUEST",
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const vpnTokensTable = new aws.dynamodb.Table(
      `${name}-vpn-tokens`,
      {
        attributes: [{ name: "token", type: "S" }],
        hashKey: "token",
        billingMode: "PAY_PER_REQUEST",
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    // --- Proxy Scraper & API (Existing) ---

    const proxyScraper = new aws.lambda.CallbackFunction(
      `${name}-proxy-scraper`,
      {
        runtime: "nodejs20.x",
        timeout: 60,
        memorySize: 256,
        environment: { variables: { TABLE_NAME: proxyTable.name } },
        callback: async () => {
          const AWS = require("aws-sdk");
          const https = require("https");
          const ddb = new AWS.DynamoDB.DocumentClient();
          const tableName = process.env.TABLE_NAME;

          function fetchText(url: string): Promise<string> {
            return new Promise((resolve, reject) => {
              https
                .get(url, (res: any) => {
                  let data = "";
                  res.on("data", (c: string) => (data += c));
                  res.on("end", () => resolve(data));
                })
                .on("error", reject);
            });
          }

          // Simple source: raw HTTP proxies list (public)
          const url =
            "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt";
          const text = await fetchText(url);
          const lines = text
            .split(/\n+/)
            .filter((l: string) => l.includes(":"));
          const items = lines.slice(0, 100).map((line: string, idx: number) => {
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
                },
              },
            };
          });

          // Batch write in chunks of 25
          for (let i = 0; i < items.length; i += 25) {
            const chunk = items.slice(i, i + 25);
            await ddb
              .batchWrite({ RequestItems: { [tableName!]: chunk } })
              .promise();
          }

          return {
            statusCode: 200,
            body: JSON.stringify({ inserted: items.length }),
          };
        },
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-scraper-ddb-access`,
      {
        role: proxyScraper.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBFullAccess,
      },
      { parent: this }
    );

    // Schedule every 30 minutes
    const rule = new aws.cloudwatch.EventRule(
      `${name}-scrape-schedule`,
      { scheduleExpression: "rate(30 minutes)" },
      { parent: this }
    );
    new aws.cloudwatch.EventTarget(
      `${name}-scrape-target`,
      { rule: rule.name, arn: proxyScraper.arn },
      { parent: this }
    );
    new aws.lambda.Permission(
      `${name}-allow-events`,
      {
        action: "lambda:InvokeFunction",
        function: proxyScraper.arn,
        principal: "events.amazonaws.com",
        sourceArn: rule.arn,
      },
      { parent: this }
    );

    const proxyApiHandler = new aws.lambda.CallbackFunction(
      `${name}-api`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        timeout: 30,
        environment: { variables: { TABLE_NAME: proxyTable.name } },
        callback: async (event: any) => {
          const AWS = require("aws-sdk");
          const ddb = new AWS.DynamoDB.DocumentClient();
          const tableName = process.env.TABLE_NAME;
          // Return top 50 recent proxies (naive scan)
          const data = await ddb
            .scan({ TableName: tableName, Limit: 50 })
            .promise();
          return { statusCode: 200, body: JSON.stringify(data.Items ?? []) };
        },
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-api-ddb-access`,
      {
        role: proxyApiHandler.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBReadOnlyAccess,
      },
      { parent: this }
    );

    // --- VPN Lambdas ---

    // A. Server Registration
    const registerServer = new aws.lambda.CallbackFunction(
      `${name}-register-server`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        environment: {
          variables: {
            SERVERS_TABLE: vpnServersTable.name,
            TOKENS_TABLE: vpnTokensTable.name,
          },
        },
        callback: async (event: any) => {
          const AWS = require("aws-sdk");
          const ddb = new AWS.DynamoDB.DocumentClient();
          const body = JSON.parse(event.body || "{}");
          const { id, token, publicIp, metadata } = body;

          if (!id || !token) {
            return { statusCode: 400, body: "Missing id or token" };
          }

          const tokenRes = await ddb
            .get({
              TableName: process.env.TOKENS_TABLE,
              Key: { token },
            })
            .promise();

          if (!tokenRes.Item) {
            return { statusCode: 401, body: "Invalid token" };
          }

          await ddb
            .put({
              TableName: process.env.SERVERS_TABLE,
              Item: {
                id,
                publicIp,
                metadata,
                status: "online",
                lastSeen: new Date().toISOString(),
              },
            })
            .promise();

          return {
            statusCode: 200,
            body: JSON.stringify({ status: "registered" }),
          };
        },
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-reg-ddb-access`,
      {
        role: registerServer.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBFullAccess,
      },
      { parent: this }
    );

    // B. Server Heartbeat
    const heartbeatServer = new aws.lambda.CallbackFunction(
      `${name}-heartbeat-server`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        environment: {
          variables: {
            SERVERS_TABLE: vpnServersTable.name,
          },
        },
        callback: async (event: any) => {
          const AWS = require("aws-sdk");
          const ddb = new AWS.DynamoDB.DocumentClient();
          const body = JSON.parse(event.body || "{}");
          const { id, metrics } = body;

          if (!id) {
            return { statusCode: 400, body: "Missing id" };
          }

          // Partial update (if server exists)
          // For simplicity, we just update/overwrite or we could check existence.
          // Here we'll do a quick update expression
          try {
            await ddb
              .update({
                TableName: process.env.SERVERS_TABLE,
                Key: { id },
                UpdateExpression: "set metrics = :m, lastSeen = :t, #s = :s",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                  ":m": metrics || {},
                  ":t": new Date().toISOString(),
                  ":s": "online",
                },
              })
              .promise();
            return { statusCode: 200, body: JSON.stringify({ status: "ok" }) };
          } catch (e: any) {
            console.error(e);
            return { statusCode: 500, body: "Error updating heartbeat" };
          }
        },
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-heart-ddb-access`,
      {
        role: heartbeatServer.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBFullAccess,
      },
      { parent: this }
    );

    // C. Peer Sync
    const getPeers = new aws.lambda.CallbackFunction(
      `${name}-get-peers`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        environment: {
          variables: {
            PEERS_TABLE: vpnPeersTable.name,
          },
        },
        callback: async (event: any) => {
          const AWS = require("aws-sdk");
          const ddb = new AWS.DynamoDB.DocumentClient();
          // Return all peers (naive for now, filter by server later if needed)
          const data = await ddb
            .scan({ TableName: process.env.PEERS_TABLE })
            .promise();

          // Map to format expected by server
          // Input peer: { publicKey, allowedIps }
          return { statusCode: 200, body: JSON.stringify(data.Items ?? []) };
        },
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-peers-ddb-access`,
      {
        role: getPeers.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBReadOnlyAccess,
      },
      { parent: this }
    );

    // D. Add Peer (Protected by API Key)
    const addPeer = new aws.lambda.CallbackFunction(
      `${name}-add-peer`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        environment: {
          variables: {
            PEERS_TABLE: vpnPeersTable.name,
            WEB_API_KEY: webApiKey,
          },
        },
        callback: async (event: any) => {
          const AWS = require("aws-sdk");
          const ddb = new AWS.DynamoDB.DocumentClient();

          // Auth Check
          const apiKey =
            event.headers["x-api-key"] || event.headers["X-Api-Key"];
          if (apiKey !== process.env.WEB_API_KEY) {
            return { statusCode: 401, body: "Unauthorized" };
          }

          const body = JSON.parse(event.body || "{}");
          const { publicKey, userId, allowedIps } = body;

          if (!publicKey || !userId) {
            return { statusCode: 400, body: "Missing publicKey or userId" };
          }

          await ddb
            .put({
              TableName: process.env.PEERS_TABLE,
              Item: {
                publicKey,
                userId,
                allowedIps: allowedIps || [],
                createdAt: new Date().toISOString(),
              },
            })
            .promise();

          return {
            statusCode: 200,
            body: JSON.stringify({ status: "peer_added" }),
          };
        },
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-addpeer-ddb-access`,
      {
        role: addPeer.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBFullAccess,
      },
      { parent: this }
    );

    // --- API Gateway ---

    const httpApi = new aws.apigatewayv2.Api(
      `${name}-http`,
      { protocolType: "HTTP" },
      { parent: this }
    );

    // Helpers for integrations and routes
    const createRoute = (
      routeKey: string,
      lambda: aws.lambda.CallbackFunction,
      suffix: string
    ) => {
      const integration = new aws.apigatewayv2.Integration(
        `${name}-int-${suffix}`,
        {
          apiId: httpApi.id,
          integrationType: "AWS_PROXY",
          integrationUri: lambda.arn,
          integrationMethod: "POST",
          payloadFormatVersion: "2.0",
        },
        { parent: this }
      );

      new aws.apigatewayv2.Route(
        `${name}-route-${suffix}`,
        {
          apiId: httpApi.id,
          routeKey: routeKey,
          target: pulumi.interpolate`integrations/${integration.id}`,
        },
        { parent: this }
      );

      new aws.lambda.Permission(
        `${name}-perm-${suffix}`,
        {
          action: "lambda:InvokeFunction",
          function: lambda.arn,
          principal: "apigateway.amazonaws.com",
          sourceArn: pulumi.interpolate`${httpApi.executionArn}/*/*`,
        },
        { parent: this }
      );
    };

    // Register Routes
    createRoute("GET /proxies", proxyApiHandler, "proxies");
    createRoute("POST /server/register", registerServer, "reg-srv");
    createRoute("POST /server/heartbeat", heartbeatServer, "hb-srv");
    createRoute("GET /server/peers", getPeers, "get-peers");
    createRoute("POST /peers", addPeer, "add-peer");

    const stage = new aws.apigatewayv2.Stage(
      `${name}-stage`,
      { apiId: httpApi.id, name: "$default", autoDeploy: true },
      { parent: this }
    );

    this.apiUrl = httpApi.apiEndpoint;
    this.registerOutputs({ apiUrl: this.apiUrl });
  }
}
