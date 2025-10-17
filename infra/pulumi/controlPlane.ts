import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export class ControlPlane extends pulumi.ComponentResource {
  public readonly apiUrl: pulumi.Output<string>;

  constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
    super("vpnvpn:components:ControlPlane", name, {}, opts);

    const table = new aws.dynamodb.Table(
      `${name}-proxies`,
      {
        attributes: [{ name: "proxyId", type: "S" }],
        hashKey: "proxyId",
        billingMode: "PAY_PER_REQUEST",
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    const proxyScraper = new aws.lambda.CallbackFunction(
      `${name}-proxy-scraper`,
      {
        runtime: "nodejs20.x",
        timeout: 60,
        memorySize: 256,
        environment: { variables: { TABLE_NAME: table.name } },
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

    // API: GET /proxies
    const apiHandler = new aws.lambda.CallbackFunction(
      `${name}-api`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        timeout: 30,
        environment: { variables: { TABLE_NAME: table.name } },
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
        role: apiHandler.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBReadOnlyAccess,
      },
      { parent: this }
    );

    const httpApi = new aws.apigatewayv2.Api(
      `${name}-http`,
      { protocolType: "HTTP" },
      { parent: this }
    );
    const integration = new aws.apigatewayv2.Integration(
      `${name}-int`,
      {
        apiId: httpApi.id,
        integrationType: "AWS_PROXY",
        integrationUri: apiHandler.arn,
        integrationMethod: "POST",
        payloadFormatVersion: "2.0",
      },
      { parent: this }
    );
    new aws.apigatewayv2.Route(
      `${name}-route-proxies`,
      {
        apiId: httpApi.id,
        routeKey: "GET /proxies",
        target: pulumi.interpolate`integrations/${integration.id}`,
      },
      { parent: this }
    );
    const stage = new aws.apigatewayv2.Stage(
      `${name}-stage`,
      { apiId: httpApi.id, name: "$default", autoDeploy: true },
      { parent: this }
    );
    new aws.lambda.Permission(
      `${name}-api-perm`,
      {
        action: "lambda:InvokeFunction",
        function: apiHandler.arn,
        principal: "apigateway.amazonaws.com",
        sourceArn: pulumi.interpolate`${httpApi.executionArn}/*/*`,
      },
      { parent: this }
    );

    this.apiUrl = httpApi.apiEndpoint;
    this.registerOutputs({ apiUrl: this.apiUrl });
  }
}
