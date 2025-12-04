import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export interface MetricsServiceArgs {
  /**
   * S3 bucket containing the Lambda deployment package.
   * If not provided, assumes Docker image deployment.
   */
  codeBucket?: pulumi.Input<string>;
  /**
   * S3 key for the Lambda deployment package.
   */
  codeKey?: pulumi.Input<string>;
  /**
   * ECR image URI for Docker-based Lambda deployment.
   */
  imageUri?: pulumi.Input<string>;
  /**
   * Database URL for Prisma connection.
   */
  databaseUrl: pulumi.Input<string>;
  /**
   * Custom domain name for the API (e.g., metrics.vpnvpn.dev).
   */
  domainName?: pulumi.Input<string>;
  /**
   * ACM Certificate ARN for the custom domain.
   */
  certificateArn?: pulumi.Input<string>;
}

/**
 * MetricsService provisions AWS Lambda and API Gateway resources for the
 * metrics service. Supports both ZIP-based and Docker image deployment.
 */
export class MetricsService extends pulumi.ComponentResource {
  public readonly apiUrl: pulumi.Output<string>;
  public readonly functionArn: pulumi.Output<string>;

  constructor(
    name: string,
    args: MetricsServiceArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("vpnvpn:components:MetricsService", name, {}, opts);

    const config = new pulumi.Config();

    // If no deployment args provided, fall back to URL-only mode
    if (!args.imageUri && !args.codeBucket) {
      const url =
        config.get("metricsApiUrl") ??
        "https://example-metrics.your-domain.com";
      this.apiUrl = pulumi.output(url);
      this.functionArn = pulumi.output("");
      this.registerOutputs({
        apiUrl: this.apiUrl,
        functionArn: this.functionArn,
      });
      return;
    }

    // IAM role for Lambda execution
    const lambdaRole = new aws.iam.Role(
      `${name}-lambda-role`,
      {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Action: "sts:AssumeRole",
              Principal: { Service: "lambda.amazonaws.com" },
              Effect: "Allow",
            },
          ],
        }),
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    // Attach basic Lambda execution policy
    new aws.iam.RolePolicyAttachment(
      `${name}-lambda-basic`,
      {
        role: lambdaRole.name,
        policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
      },
      { parent: this }
    );

    // Attach VPC access policy (needed if Lambda needs to reach RDS in VPC)
    new aws.iam.RolePolicyAttachment(
      `${name}-lambda-vpc`,
      {
        role: lambdaRole.name,
        policyArn: aws.iam.ManagedPolicies.AWSLambdaVPCAccessExecutionRole,
      },
      { parent: this }
    );

    // Environment variables for the Lambda function
    const environment = {
      variables: {
        DATABASE_URL: args.databaseUrl,
        NODE_OPTIONS: "--enable-source-maps",
      },
    };

    // Create Lambda function - Docker image or ZIP deployment
    let lambdaFunction: aws.lambda.Function;

    if (args.imageUri) {
      // Docker image deployment
      lambdaFunction = new aws.lambda.Function(
        `${name}-fn`,
        {
          packageType: "Image",
          imageUri: args.imageUri,
          role: lambdaRole.arn,
          timeout: 30,
          memorySize: 256,
          environment,
          tags: { Project: "vpnvpn" },
        },
        { parent: this }
      );
    } else {
      // ZIP deployment from S3
      lambdaFunction = new aws.lambda.Function(
        `${name}-fn`,
        {
          runtime: "nodejs20.x",
          handler: "lambda.handler",
          s3Bucket: args.codeBucket!,
          s3Key: args.codeKey!,
          role: lambdaRole.arn,
          timeout: 30,
          memorySize: 256,
          environment,
          tags: { Project: "vpnvpn" },
        },
        { parent: this }
      );
    }

    // HTTP API Gateway (v2)
    const api = new aws.apigatewayv2.Api(
      `${name}-api`,
      {
        protocolType: "HTTP",
        corsConfiguration: {
          allowOrigins: ["*"],
          allowMethods: ["GET", "POST", "OPTIONS"],
          allowHeaders: ["*"],
        },
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    // Lambda integration
    const integration = new aws.apigatewayv2.Integration(
      `${name}-integration`,
      {
        apiId: api.id,
        integrationType: "AWS_PROXY",
        integrationUri: lambdaFunction.arn,
        payloadFormatVersion: "2.0",
      },
      { parent: this }
    );

    // Default route (catch-all)
    new aws.apigatewayv2.Route(
      `${name}-route`,
      {
        apiId: api.id,
        routeKey: "$default",
        target: pulumi.interpolate`integrations/${integration.id}`,
      },
      { parent: this }
    );

    // Stage (auto-deploy)
    const stage = new aws.apigatewayv2.Stage(
      `${name}-stage`,
      {
        apiId: api.id,
        name: "$default",
        autoDeploy: true,
        tags: { Project: "vpnvpn" },
      },
      { parent: this }
    );

    // Custom Domain Mapping
    if (args.domainName && args.certificateArn) {
      const domainName = new aws.apigatewayv2.DomainName(
        `${name}-domain`,
        {
          domainName: args.domainName,
          domainNameConfiguration: {
            certificateArn: args.certificateArn,
            endpointType: "REGIONAL",
            securityPolicy: "TLS_1_2",
          },
          tags: { Project: "vpnvpn" },
        },
        { parent: this }
      );

      new aws.apigatewayv2.ApiMapping(
        `${name}-mapping`,
        {
          apiId: api.id,
          domainName: domainName.domainName,
          stage: stage.name,
        },
        { parent: this }
      );
    }

    // Grant API Gateway permission to invoke Lambda
    new aws.lambda.Permission(
      `${name}-api-permission`,
      {
        action: "lambda:InvokeFunction",
        function: lambdaFunction.name,
        principal: "apigateway.amazonaws.com",
        sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
      },
      { parent: this }
    );

    this.apiUrl = pulumi.interpolate`${api.apiEndpoint}`;
    this.functionArn = lambdaFunction.arn;

    this.registerOutputs({
      apiUrl: this.apiUrl,
      functionArn: this.functionArn,
    });
  }
}



