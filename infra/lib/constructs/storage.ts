import * as cdk from "aws-cdk-lib"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import { Construct } from "constructs"

export interface StorageConstructProps {
    removalPolicy?: cdk.RemovalPolicy
}

export class StorageConstruct extends Construct {
    public readonly bucket: s3.Bucket
    public readonly table: dynamodb.Table

    constructor(scope: Construct, id: string, props?: StorageConstructProps) {
        super(scope, id)

        const removalPolicy = props?.removalPolicy ?? cdk.RemovalPolicy.RETAIN

        // S3 Bucket — single bucket for markdown files and images
        this.bucket = new s3.Bucket(this, "ContentBucket", {
            bucketName: `jot-down-content-${cdk.Aws.ACCOUNT_ID}`,
            removalPolicy,
            autoDeleteObjects: removalPolicy === cdk.RemovalPolicy.DESTROY,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            versioned: false, // Cost saving — no versioning for MVP
            cors: [
                {
                    allowedHeaders: ["*"],
                    allowedMethods: [
                        s3.HttpMethods.GET,
                        s3.HttpMethods.PUT,
                        s3.HttpMethods.POST,
                        s3.HttpMethods.DELETE,
                    ],
                    allowedOrigins: [
                        "http://localhost:3000",
                        "https://*.netlify.app",
                    ],
                    exposedHeaders: ["ETag"],
                    maxAge: 3600,
                },
            ],
            lifecycleRules: [
                {
                    // Move to Infrequent Access after 90 days for cost savings
                    transitions: [
                        {
                            storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                            transitionAfter: cdk.Duration.days(90),
                        },
                    ],
                },
            ],
        })

        // DynamoDB Table — single-table design
        this.table = new dynamodb.Table(this, "MetadataTable", {
            tableName: "jot-down-table",
            partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Cost saving
            removalPolicy,
            pointInTimeRecovery: false, // Cost saving for MVP
        })

        // GSI for user → wikis lookups
        this.table.addGlobalSecondaryIndex({
            indexName: "GSI1",
            partitionKey: {
                name: "GSI1PK",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL,
        })
    }
}
