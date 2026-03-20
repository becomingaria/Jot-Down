import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import { StorageConstruct } from "./constructs/storage"
import { AuthConstruct } from "./constructs/auth"
import { ApiConstruct } from "./constructs/api"
import { WebSocketConstruct } from "./constructs/websocket"

export class JotDownStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        // Storage: S3 + DynamoDB
        const storage = new StorageConstruct(this, "Storage", {
            removalPolicy: cdk.RemovalPolicy.DESTROY, // DESTROY for dev, change to RETAIN for prod
        })

        // Auth: Cognito User Pool + seeded users
        const auth = new AuthConstruct(this, "Auth", {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        })

        // API: API Gateway + Lambda functions
        const api = new ApiConstruct(this, "Api", {
            userPool: auth.userPool,
            table: storage.table,
            bucket: storage.bucket,
        })

        // WebSocket: real-time collaboration
        const ws = new WebSocketConstruct(this, "WebSocket", {
            table: storage.table,
        })

        // Grant the file handler permission to broadcast via WebSocket
        // and let it read/write the connection records in DynamoDB
        ws.grantBroadcastTo(api.fileHandler)

        // --- Outputs ---
        new cdk.CfnOutput(this, "ApiUrl", {
            value: api.api.url,
            description: "API Gateway URL",
            exportName: "JotDownApiUrl",
        })

        new cdk.CfnOutput(this, "UserPoolId", {
            value: auth.userPool.userPoolId,
            description: "Cognito User Pool ID",
            exportName: "JotDownUserPoolId",
        })

        new cdk.CfnOutput(this, "UserPoolClientId", {
            value: auth.userPoolClient.userPoolClientId,
            description: "Cognito App Client ID",
            exportName: "JotDownUserPoolClientId",
        })

        new cdk.CfnOutput(this, "BucketName", {
            value: storage.bucket.bucketName,
            description: "S3 Content Bucket Name",
            exportName: "JotDownBucketName",
        })

        new cdk.CfnOutput(this, "TableName", {
            value: storage.table.tableName,
            description: "DynamoDB Table Name",
            exportName: "JotDownTableName",
        })

        new cdk.CfnOutput(this, "WsUrl", {
            value: ws.wsUrl,
            description: "WebSocket API URL (set VITE_WS_URL in Netlify env)",
            exportName: "JotDownWsUrl",
        })
    }
}
