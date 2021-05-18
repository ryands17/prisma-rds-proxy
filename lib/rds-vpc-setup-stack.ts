import * as cdk from '@aws-cdk/core'
import * as ec2 from '@aws-cdk/aws-ec2'
import * as rds from '@aws-cdk/aws-rds'
import * as iam from '@aws-cdk/aws-iam'
import * as ln from '@aws-cdk/aws-lambda-nodejs'
import * as apigateway from '@aws-cdk/aws-apigateway'
import { Runtime } from '@aws-cdk/aws-lambda'
import { join } from 'path'

export class RdsVpcSetupStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // VPC with public and private subnets
    const vpc = new ec2.Vpc(this, 'serverless-app', {
      cidr: '10.0.0.0/20',
      natGateways: 0,
      maxAzs: 2,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 22,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 22,
          name: 'private',
          subnetType: ec2.SubnetType.ISOLATED,
        },
      ],
    })

    // Create the required security groups
    const publicSg = new ec2.SecurityGroup(this, 'public-sg', {
      vpc,
      securityGroupName: 'public-sg',
    })
    publicSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Bastion Host SSH connection'
    )

    const privateSg = new ec2.SecurityGroup(this, 'private-sg', {
      vpc,
      securityGroupName: 'private-sg',
    })
    privateSg.addIngressRule(
      publicSg,
      ec2.Port.tcp(5432),
      'allow access to RDS'
    )
    privateSg.addIngressRule(
      privateSg,
      ec2.Port.allTraffic(),
      'allow internal SG access'
    )

    const keyName = this.node.tryGetContext('keyname')
    const instance = new ec2.Instance(this, 'bastion-host', {
      vpc,
      keyName,
      instanceName: 'bastion-host',
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: publicSg,
    })

    instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    )

    // Secret for RDS username and password
    const rdsCredentials = new rds.DatabaseSecret(this, 'rds-credentials', {
      username: 'postgres',
    })

    // RDS Postgres instance and its Subnet Group
    const subnetGroup = new rds.SubnetGroup(this, 'rds-subnet-group', {
      vpc,
      subnetGroupName: 'rds-subnet-group',
      vpcSubnets: { subnetType: ec2.SubnetType.ISOLATED },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      description: 'An all private subnets group',
    })
    const pg = new rds.DatabaseInstance(this, 'rds-instance', {
      vpc,
      subnetGroup,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_11_9,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      securityGroups: [privateSg],
      databaseName: 'postgres',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoMinorVersionUpgrade: false,
      credentials: rds.Credentials.fromSecret(rdsCredentials),
    })

    const rdsProxy = pg.addProxy('rds-proxy', {
      vpc,
      secrets: [rdsCredentials],
      requireTLS: false,
      dbProxyName: 'db-proxy',
      idleClientTimeout: cdk.Duration.minutes(60),
      maxConnectionsPercent: 100,
      vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.ISOLATED }),
      securityGroups: [privateSg],
    })

    // VPC Interface Endpoint to access the database secret
    new ec2.InterfaceVpcEndpoint(this, 'secrets-manager', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      vpc,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.ISOLATED },
      securityGroups: [privateSg],
    })

    // Lambda function to handle requests
    const handler = new ln.NodejsFunction(this, 'prisma', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.ISOLATED },
      securityGroups: [privateSg],
      runtime: Runtime.NODEJS_14_X,
      handler: 'handler',
      entry: join(__dirname, '..', 'functions', 'index.ts'),
      timeout: cdk.Duration.seconds(10),
      memorySize: 1024,
      environment: {
        DB_HOST: rdsProxy.endpoint,
        SECRET_ID: rdsCredentials.secretArn,
      },
      bundling: {
        nodeModules: ['@prisma/client', 'prisma'],
        commandHooks: {
          beforeBundling(_inputDir: string, _outputDir: string) {
            return []
          },
          beforeInstall(_inputDir: string, outputDir: string) {
            return [`cp -R ../prisma ${outputDir}/`]
          },
          afterBundling(_inputDir: string, outputDir: string) {
            return [
              `cd ${outputDir}`,
              `yarn prisma generate`,
              `rm -rf node_modules/@prisma/engines`,
              `rm -rf node_modules/@prisma/client/node_modules node_modules/.bin node_modules/prisma`,
            ]
          },
        },
      },
    })

    handler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [rdsCredentials.secretArn],
      })
    )

    // The API Gateway
    new apigateway.LambdaRestApi(this, 'prisma-api', { handler })
  }
}
