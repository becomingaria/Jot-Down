#!/usr/bin/env node
import "source-map-support/register"
import * as cdk from "aws-cdk-lib"
import { JotDownStack } from "../lib/jot-down-stack"

const app = new cdk.App()

new JotDownStack(app, "JotDownStack", {
    env: {
        // Uses the default region from the AWS profile
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
    description: "Jot-Down Wiki - S3, DynamoDB, Cognito, API Gateway, Lambda",
})
