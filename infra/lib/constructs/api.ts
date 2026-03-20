import * as cdk from "aws-cdk-lib"
import * as apigateway from "aws-cdk-lib/aws-apigateway"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as cognito from "aws-cdk-lib/aws-cognito"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as path from "path"
import { Construct } from "constructs"

export interface ApiConstructProps {
    userPool: cognito.UserPool
    table: dynamodb.Table
    bucket: s3.Bucket
}

export class ApiConstruct extends Construct {
    public readonly api: apigateway.RestApi
    public readonly fileHandler: lambda.Function

    constructor(scope: Construct, id: string, props: ApiConstructProps) {
        super(scope, id)

        const { userPool, table, bucket } = props

        // Shared environment variables for all Lambdas
        const sharedEnv = {
            TABLE_NAME: table.tableName,
            BUCKET_NAME: bucket.bucketName,
            USER_POOL_ID: userPool.userPoolId,
            // Keep the number of stored versions bounded to avoid unbounded DynamoDB growth.
            // Increasing this value will allow more historical checkpoints per file.
            MAX_VERSIONS_PER_FILE: "10",
        }

        // Shared Lambda configuration — ARM64 for cost saving
        const lambdaDefaults: Partial<lambda.FunctionProps> = {
            runtime: lambda.Runtime.NODEJS_20_X,
            architecture: lambda.Architecture.ARM_64,
            memorySize: 256,
            timeout: cdk.Duration.seconds(30),
            environment: sharedEnv,
        }

        // --- Lambda Functions ---

        const wikiHandler = new lambda.Function(this, "WikiHandler", {
            ...lambdaDefaults,
            functionName: "jot-down-wiki",
            handler: "index.handler",
            code: lambda.Code.fromAsset(
                path.join(__dirname, "../../lambda/wiki"),
            ),
        } as lambda.FunctionProps)

        this.fileHandler = new lambda.Function(this, "FileHandler", {
            ...lambdaDefaults,
            functionName: "jot-down-file",
            handler: "index.handler",
            code: lambda.Code.fromAsset(
                path.join(__dirname, "../../lambda/file"),
            ),
        } as lambda.FunctionProps)

        const imageHandler = new lambda.Function(this, "ImageHandler", {
            ...lambdaDefaults,
            functionName: "jot-down-image",
            handler: "index.handler",
            code: lambda.Code.fromAsset(
                path.join(__dirname, "../../lambda/image"),
            ),
            memorySize: 512, // Image processing needs more memory
            timeout: cdk.Duration.seconds(60),
        } as lambda.FunctionProps)

        const exportHandler = new lambda.Function(this, "ExportHandler", {
            ...lambdaDefaults,
            functionName: "jot-down-export",
            handler: "index.handler",
            code: lambda.Code.fromAsset(
                path.join(__dirname, "../../lambda/export"),
            ),
            memorySize: 512, // Export (zip/docx) needs more memory
            timeout: cdk.Duration.seconds(60),
        } as lambda.FunctionProps)

        // Grant permissions
        table.grantReadWriteData(wikiHandler)
        table.grantReadWriteData(this.fileHandler)
        table.grantReadData(imageHandler)
        table.grantReadData(exportHandler)

        bucket.grantReadWrite(this.fileHandler)
        bucket.grantReadWrite(imageHandler)
        bucket.grantRead(exportHandler)

        // Grant Cognito admin permissions to wiki handler (for user creation by admin)
        wikiHandler.addToRolePolicy(
            new cdk.aws_iam.PolicyStatement({
                actions: [
                    "cognito-idp:AdminCreateUser",
                    "cognito-idp:AdminDeleteUser",
                    "cognito-idp:AdminAddUserToGroup",
                    "cognito-idp:AdminSetUserPassword",
                    "cognito-idp:ListUsers",
                    "cognito-idp:AdminGetUser",
                ],
                resources: [userPool.userPoolArn],
            }),
        )

        // --- API Gateway ---

        this.api = new apigateway.RestApi(this, "Api", {
            restApiName: "jot-down-api",
            description: "Jot-Down Wiki API",
            deployOptions: {
                stageName: "prod",
                throttlingBurstLimit: 50,
                throttlingRateLimit: 100,
            },
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    "Content-Type",
                    "Authorization",
                    "X-Amz-Date",
                    "X-Api-Key",
                    "X-Amz-Security-Token",
                ],
            },
        })

        // Ensure CORS headers are included even on 4xx / 401 / access denied responses
        const corsResponseHeaders = {
            "Access-Control-Allow-Origin": "'*'",
            "Access-Control-Allow-Headers": "'*'",
            "Access-Control-Allow-Methods": "'*'",
        }

        this.api.addGatewayResponse("Default4xx", {
            type: apigateway.ResponseType.DEFAULT_4XX,
            responseHeaders: corsResponseHeaders,
        })
        this.api.addGatewayResponse("Unauthorized", {
            type: apigateway.ResponseType.UNAUTHORIZED,
            responseHeaders: corsResponseHeaders,
        })
        this.api.addGatewayResponse("AccessDenied", {
            type: apigateway.ResponseType.ACCESS_DENIED,
            responseHeaders: corsResponseHeaders,
        })

        // Cognito Authorizer
        const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
            this,
            "Authorizer",
            {
                cognitoUserPools: [userPool],
                authorizerName: "jot-down-authorizer",
            },
        )

        const authMethodOptions: apigateway.MethodOptions = {
            authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        }

        // --- Routes ---

        // /wikis
        const wikis = this.api.root.addResource("wikis")
        wikis.addMethod(
            "GET",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )
        wikis.addMethod(
            "POST",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}
        const wiki = wikis.addResource("{wikiId}")
        wiki.addMethod(
            "GET",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )
        wiki.addMethod(
            "PUT",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )
        wiki.addMethod(
            "DELETE",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/shares
        const shares = wiki.addResource("shares")
        shares.addMethod(
            "GET",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )
        shares.addMethod(
            "POST",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/shares/{userId}
        const share = shares.addResource("{userId}")
        share.addMethod(
            "PUT",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )
        share.addMethod(
            "DELETE",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/users — search users for sharing autocomplete
        const users = wiki.addResource("users")
        users.addMethod(
            "GET",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/folders
        const folders = wiki.addResource("folders")
        folders.addMethod(
            "GET",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )
        folders.addMethod(
            "POST",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/folders/{folderId}
        const folder = folders.addResource("{folderId}")
        folder.addMethod(
            "GET",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )
        folder.addMethod(
            "PUT",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )
        folder.addMethod(
            "DELETE",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/folders/{folderId}/export
        const folderExport = folder.addResource("export")
        folderExport.addMethod(
            "GET",
            new apigateway.LambdaIntegration(exportHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/files
        const files = wiki.addResource("files")
        files.addMethod(
            "GET",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )
        files.addMethod(
            "POST",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/files/import
        const fileImport = files.addResource("import")
        fileImport.addMethod(
            "POST",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/files/{fileId}
        const file = files.addResource("{fileId}")
        file.addMethod(
            "GET",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )
        file.addMethod(
            "PUT",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )
        file.addMethod(
            "DELETE",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/files/{fileId}/versions
        const versions = file.addResource("versions")
        versions.addMethod(
            "GET",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )
        versions.addMethod(
            "POST",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/files/{fileId}/versions/{versionId}
        const version = versions.addResource("{versionId}")
        version.addMethod(
            "GET",
            new apigateway.LambdaIntegration(this.fileHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/files/{fileId}/export
        const fileExport = file.addResource("export")
        fileExport.addMethod(
            "GET",
            new apigateway.LambdaIntegration(exportHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/images
        const images = wiki.addResource("images")

        // /wikis/{wikiId}/images/upload
        const imageUpload = images.addResource("upload")
        imageUpload.addMethod(
            "POST",
            new apigateway.LambdaIntegration(imageHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/images/{imageId}
        const image = images.addResource("{imageId}")
        image.addMethod(
            "GET",
            new apigateway.LambdaIntegration(imageHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/images/{imageId}/download
        const imageDownload = image.addResource("download")
        imageDownload.addMethod(
            "GET",
            new apigateway.LambdaIntegration(imageHandler),
            authMethodOptions,
        )

        // /wikis/{wikiId}/export
        const wikiExport = wiki.addResource("export")
        wikiExport.addMethod(
            "GET",
            new apigateway.LambdaIntegration(exportHandler),
            authMethodOptions,
        )

        // --- Admin routes ---
        // /admin/users
        const admin = this.api.root.addResource("admin")
        const adminUsers = admin.addResource("users")
        adminUsers.addMethod(
            "GET",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )
        adminUsers.addMethod(
            "POST",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )

        // /admin/users/{userId}
        const adminUser = adminUsers.addResource("{userId}")
        adminUser.addMethod(
            "DELETE",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )
        adminUser.addMethod(
            "PUT",
            new apigateway.LambdaIntegration(wikiHandler),
            authMethodOptions,
        )
    }
}
