// @ts-nocheck
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { handler as registerServerHandler } from "./lambda/registerServer";
import { handler as heartbeatServerHandler } from "./lambda/heartbeatServer";
import { handler as getPeersHandler } from "./lambda/getPeers";
import { handler as addPeerHandler } from "./lambda/addPeer";
import { handler as revokeUserPeersHandler } from "./lambda/revokeUserPeers";
import { handler as revokePeerHandler } from "./lambda/revokePeer";
import { handler as listProxiesHandler } from "./lambda/listProxies";
import { handler as scrapeProxiesHandler } from "./lambda/scrapeProxies";
import { handler as listServersHandler } from "./lambda/listServers";
import { handler as createTokenHandler } from "./lambda/createToken";
import { handler as listTokensHandler } from "./lambda/listTokens";
import { handler as revokeTokenHandler } from "./lambda/revokeToken";

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
        attributes: [
          { name: "publicKey", type: "S" },
          { name: "userId", type: "S" },
        ],
        hashKey: "publicKey",
        billingMode: "PAY_PER_REQUEST",
        globalSecondaryIndexes: [
          {
            name: "userId-index",
            hashKey: "userId",
            projectionType: "ALL",
          },
        ],
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

    // --- Proxy Scraper & API ---

    const proxyScraper = new aws.lambda.CallbackFunction(
      `${name}-proxy-scraper`,
      {
        runtime: "nodejs20.x",
        timeout: 60,
        memorySize: 256,
        environment: { variables: { TABLE_NAME: proxyTable.name } },
        callback: scrapeProxiesHandler,
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
        callback: listProxiesHandler,
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
        callback: registerServerHandler,
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
        callback: heartbeatServerHandler,
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
        callback: getPeersHandler,
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
        callback: addPeerHandler,
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

    // E. Revoke Peers for User (Protected by API Key)
    const revokeUserPeers = new aws.lambda.CallbackFunction(
      `${name}-revoke-user-peers`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        environment: {
          variables: {
            PEERS_TABLE: vpnPeersTable.name,
            WEB_API_KEY: webApiKey,
          },
        },
        callback: revokeUserPeersHandler,
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-revokepeers-ddb-access`,
      {
        role: revokeUserPeers.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBFullAccess,
      },
      { parent: this }
    );

    // F. List Servers (admin, protected by API key)
    const listServers = new aws.lambda.CallbackFunction(
      `${name}-list-servers`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        environment: {
          variables: {
            SERVERS_TABLE: vpnServersTable.name,
            WEB_API_KEY: webApiKey,
          },
        },
        callback: listServersHandler,
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-listservers-ddb-access`,
      {
        role: listServers.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBReadOnlyAccess,
      },
      { parent: this }
    );

    // G. Revoke Single Peer (web app, protected by API key)
    const revokePeer = new aws.lambda.CallbackFunction(
      `${name}-revoke-peer`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        environment: {
          variables: {
            PEERS_TABLE: vpnPeersTable.name,
            WEB_API_KEY: webApiKey,
          },
        },
        callback: revokePeerHandler,
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-revokepeer-ddb-access`,
      {
        role: revokePeer.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBFullAccess,
      },
      { parent: this }
    );

    // H. Create Token (admin, protected by API key)
    const createToken = new aws.lambda.CallbackFunction(
      `${name}-create-token`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        environment: {
          variables: {
            TOKENS_TABLE: vpnTokensTable.name,
            WEB_API_KEY: webApiKey,
          },
        },
        callback: createTokenHandler,
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-createtoken-ddb-access`,
      {
        role: createToken.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBFullAccess,
      },
      { parent: this }
    );

    // I. List Tokens (admin, protected by API key)
    const listTokens = new aws.lambda.CallbackFunction(
      `${name}-list-tokens`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        environment: {
          variables: {
            TOKENS_TABLE: vpnTokensTable.name,
            WEB_API_KEY: webApiKey,
          },
        },
        callback: listTokensHandler,
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-listtokens-ddb-access`,
      {
        role: listTokens.role!,
        policyArn: aws.iam.ManagedPolicies.AmazonDynamoDBReadOnlyAccess,
      },
      { parent: this }
    );

    // J. Revoke Token (admin, protected by API key)
    const revokeToken = new aws.lambda.CallbackFunction(
      `${name}-revoke-token`,
      {
        runtime: "nodejs20.x",
        memorySize: 256,
        environment: {
          variables: {
            TOKENS_TABLE: vpnTokensTable.name,
            WEB_API_KEY: webApiKey,
          },
        },
        callback: revokeTokenHandler,
        policies: [aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole],
      },
      { parent: this }
    );

    new aws.iam.RolePolicyAttachment(
      `${name}-revoketoken-ddb-access`,
      {
        role: revokeToken.role!,
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
    createRoute(
      "POST /peers/revoke-for-user",
      revokeUserPeers,
      "revoke-user-peers"
    );
    createRoute("DELETE /peers/{publicKey}", revokePeer, "revoke-peer");
    createRoute("GET /servers", listServers, "list-servers");
    createRoute("POST /tokens", createToken, "create-token");
    createRoute("GET /tokens", listTokens, "list-tokens");
    createRoute("DELETE /tokens/{token}", revokeToken, "revoke-token");

    const stage = new aws.apigatewayv2.Stage(
      `${name}-stage`,
      { apiId: httpApi.id, name: "$default", autoDeploy: true },
      { parent: this }
    );

    this.apiUrl = httpApi.apiEndpoint;
    this.registerOutputs({ apiUrl: this.apiUrl });
  }
}
