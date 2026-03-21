import * as cdk from "aws-cdk-lib"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2"
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations"
import * as events from "aws-cdk-lib/aws-events"
import * as targets from "aws-cdk-lib/aws-events-targets"
import * as path from "path"
import { Construct } from "constructs"

export interface WebSocketConstructProps {
    table: dynamodb.Table
}

export class WebSocketConstruct extends Construct {
    public readonly api: apigwv2.WebSocketApi
    public readonly stage: apigwv2.WebSocketStage
    public readonly handler: lambda.Function

    /** The full WSS URL clients should connect to, e.g. wss://abc123.execute-api.us-east-1.amazonaws.com/prod */
    public get wsUrl(): string {
        return this.stage.url
    }

    constructor(scope: Construct, id: string, props: WebSocketConstructProps) {
        super(scope, id)

        const { table } = props

        // WebSocket connection manager Lambda
        this.handler = new lambda.Function(this, "WsHandler", {
            functionName: "jot-down-ws",
            runtime: lambda.Runtime.NODEJS_20_X,
            architecture: lambda.Architecture.ARM_64,
            memorySize: 256,
            timeout: cdk.Duration.seconds(30),
            handler: "index.handler",
            code: lambda.Code.fromAsset(
                path.join(__dirname, "../../lambda/ws"),
            ),
            environment: {
                TABLE_NAME: table.tableName,
            },
        })

        // Grant DynamoDB access to the WS handler
        table.grantReadWriteData(this.handler)

        // WebSocket API
        const defaultIntegration = new integrations.WebSocketLambdaIntegration(
            "WsDefaultIntegration",
            this.handler,
        )

        this.api = new apigwv2.WebSocketApi(this, "WsApi", {
            apiName: "jot-down-ws",
            connectRouteOptions: {
                integration: new integrations.WebSocketLambdaIntegration(
                    "WsConnectIntegration",
                    this.handler,
                ),
            },
            disconnectRouteOptions: {
                integration: new integrations.WebSocketLambdaIntegration(
                    "WsDisconnectIntegration",
                    this.handler,
                ),
            },
            defaultRouteOptions: {
                integration: defaultIntegration,
            },
        })

        // Deploy to a named stage
        this.stage = new apigwv2.WebSocketStage(this, "WsStage", {
            webSocketApi: this.api,
            stageName: "prod",
            autoDeploy: true,
        })

        // Allow the WS Lambda to post back to connected clients
        // (manage connections — PostToConnection)
        this.handler.addToRolePolicy(
            new cdk.aws_iam.PolicyStatement({
                actions: ["execute-api:ManageConnections"],
                resources: [
                    `arn:aws:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${this.api.apiId}/${this.stage.stageName}/POST/@connections/*`,
                ],
            }),
        )

        // Warmer: EventBridge rule fires every 5 minutes to keep the Lambda
        // execution environment alive (free tier: 1M events/month; this uses ~8,640).
        // The handler returns immediately when it sees source === 'aws.events'.
        new events.Rule(this, "WsWarmerRule", {
            ruleName: "jot-down-ws-warmer",
            description: "Keep jot-down-ws Lambda warm to avoid cold-start latency",
            schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
            targets: [new targets.LambdaFunction(this.handler)],
        })
    }

    /**
     * Grant a Lambda function the ability to broadcast via this WebSocket API.
     * Should be called for the file handler so it can push update events.
     */
    grantBroadcastTo(fn: lambda.Function): void {
        // Allow reading WS connection records from DynamoDB (already granted via table)
        fn.addEnvironment("WS_ENDPOINT", this.callbackUrl)
        fn.addToRolePolicy(
            new cdk.aws_iam.PolicyStatement({
                actions: ["execute-api:ManageConnections"],
                resources: [
                    `arn:aws:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${this.api.apiId}/${this.stage.stageName}/POST/@connections/*`,
                ],
            }),
        )
    }

    /** The HTTPS endpoint the file Lambda uses to PostToConnection */
    get callbackUrl(): string {
        return `https://${this.api.apiId}.execute-api.${cdk.Aws.REGION}.amazonaws.com/${this.stage.stageName}`
    }
}
