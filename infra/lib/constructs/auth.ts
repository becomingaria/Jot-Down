import * as cdk from "aws-cdk-lib"
import * as cognito from "aws-cdk-lib/aws-cognito"
import * as iam from "aws-cdk-lib/aws-iam"
import * as cr from "aws-cdk-lib/custom-resources"
import { Construct } from "constructs"

export interface AuthConstructProps {
    removalPolicy?: cdk.RemovalPolicy
}

export class AuthConstruct extends Construct {
    public readonly userPool: cognito.UserPool
    public readonly userPoolClient: cognito.UserPoolClient
    public readonly adminGroup: cognito.CfnUserPoolGroup

    constructor(scope: Construct, id: string, props?: AuthConstructProps) {
        super(scope, id)

        const removalPolicy = props?.removalPolicy ?? cdk.RemovalPolicy.RETAIN

        // Cognito User Pool
        this.userPool = new cognito.UserPool(this, "UserPool", {
            userPoolName: "jot-down-users",
            selfSignUpEnabled: false, // Admin-only account creation
            signInAliases: {
                email: true,
            },
            autoVerify: {
                email: true,
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
                givenName: {
                    required: false,
                    mutable: true,
                },
                familyName: {
                    required: false,
                    mutable: true,
                },
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: true,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy,
        })

        // App Client for the SPA (no secret — public client)
        this.userPoolClient = new cognito.UserPoolClient(this, "AppClient", {
            userPool: this.userPool,
            userPoolClientName: "jot-down-web",
            generateSecret: false,
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            preventUserExistenceErrors: true,
            accessTokenValidity: cdk.Duration.hours(1),
            idTokenValidity: cdk.Duration.hours(1),
            refreshTokenValidity: cdk.Duration.days(30),
        })

        // Admin group
        this.adminGroup = new cognito.CfnUserPoolGroup(this, "AdminGroup", {
            userPoolId: this.userPool.userPoolId,
            groupName: "admins",
            description:
                "Administrators who can create users and manage all wikis",
        })

        // Seed users via Custom Resource
        this.seedUsers()
    }

    private seedUsers() {
        const tempPassword = "TempPass1!"

        // Custom resource to create users
        const createUserFn = new cr.AwsCustomResource(this, "SeedAdminUser", {
            onCreate: {
                service: "CognitoIdentityServiceProvider",
                action: "adminCreateUser",
                parameters: {
                    UserPoolId: this.userPool.userPoolId,
                    Username: "becomingaria@gmail.com",
                    TemporaryPassword: tempPassword,
                    UserAttributes: [
                        { Name: "email", Value: "becomingaria@gmail.com" },
                        { Name: "email_verified", Value: "true" },
                    ],
                    MessageAction: "SUPPRESS", // Don't send welcome email during seed
                },
                physicalResourceId: cr.PhysicalResourceId.of("seed-admin-user"),
            },
            policy: cr.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ["cognito-idp:AdminCreateUser"],
                    resources: [this.userPool.userPoolArn],
                }),
            ]),
        })

        // Add admin to admins group
        const addAdminToGroup = new cr.AwsCustomResource(
            this,
            "AddAdminToGroup",
            {
                onCreate: {
                    service: "CognitoIdentityServiceProvider",
                    action: "adminAddUserToGroup",
                    parameters: {
                        UserPoolId: this.userPool.userPoolId,
                        Username: "becomingaria@gmail.com",
                        GroupName: "admins",
                    },
                    physicalResourceId:
                        cr.PhysicalResourceId.of("add-admin-to-group"),
                },
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new iam.PolicyStatement({
                        actions: ["cognito-idp:AdminAddUserToGroup"],
                        resources: [this.userPool.userPoolArn],
                    }),
                ]),
            },
        )
        addAdminToGroup.node.addDependency(createUserFn)

        // Create regular user
        const createRegularUser = new cr.AwsCustomResource(
            this,
            "SeedRegularUser",
            {
                onCreate: {
                    service: "CognitoIdentityServiceProvider",
                    action: "adminCreateUser",
                    parameters: {
                        UserPoolId: this.userPool.userPoolId,
                        Username: "kat.hallo@outlook.com",
                        TemporaryPassword: tempPassword,
                        UserAttributes: [
                            { Name: "email", Value: "kat.hallo@outlook.com" },
                            { Name: "email_verified", Value: "true" },
                        ],
                        MessageAction: "SUPPRESS",
                    },
                    physicalResourceId:
                        cr.PhysicalResourceId.of("seed-regular-user"),
                },
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new iam.PolicyStatement({
                        actions: ["cognito-idp:AdminCreateUser"],
                        resources: [this.userPool.userPoolArn],
                    }),
                ]),
            },
        )
    }
}
