import { expect as expectCDK, haveResourceLike } from '@aws-cdk/assert'
import * as cdk from '@aws-cdk/core'
import { envs } from '../bin/config'
import * as RdsVpcSetup from '../lib/rds-vpc-setup-stack'

test('VPC and its Subnets', () => {
  const stack = createStack()

  expectCDK(stack).to(
    haveResourceLike('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/20',
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
      InstanceTenancy: 'default',
    })
  )

  for (let i of [0, 4, 8, 12]) {
    expectCDK(stack).to(
      haveResourceLike('AWS::EC2::Subnet', {
        CidrBlock: `10.0.${i}.0/22`,
      })
    )
  }
})

test('Route table, IG, and attachment to the RG', () => {
  const stack = createStack()

  expectCDK(stack).to(haveResourceLike('AWS::EC2::RouteTable'))
  expectCDK(stack).to(haveResourceLike('AWS::EC2::SubnetRouteTableAssociation'))
  expectCDK(stack).to(haveResourceLike('AWS::EC2::InternetGateway'))
  expectCDK(stack).to(haveResourceLike('AWS::EC2::VPCGatewayAttachment'))
})

test('Security groups for the subnets', () => {
  const stack = createStack()

  expectCDK(stack).to(
    haveResourceLike('AWS::EC2::SecurityGroup', {
      GroupName: 'public-sg',
      SecurityGroupEgress: [
        {
          CidrIp: '0.0.0.0/0',
          Description: 'Allow all outbound traffic by default',
          IpProtocol: '-1',
        },
      ],
      SecurityGroupIngress: [
        {
          CidrIp: '0.0.0.0/0',
          Description: 'Bastion Host SSH connection',
          FromPort: 22,
          IpProtocol: 'tcp',
          ToPort: 22,
        },
      ],
    })
  )

  expectCDK(stack).to(
    haveResourceLike('AWS::EC2::SecurityGroup', {
      GroupName: 'private-sg',
      SecurityGroupEgress: [
        {
          CidrIp: '0.0.0.0/0',
          Description: 'Allow all outbound traffic by default',
          IpProtocol: '-1',
        },
      ],
    })
  )

  expectCDK(stack).to(haveResourceLike('AWS::EC2::SecurityGroupIngress'))
})

test('A bastion host for SSH Port forwarding and testing', () => {
  const stack = createStack()

  expectCDK(stack).to(
    haveResourceLike('AWS::EC2::Instance', {
      InstanceType: 't2.micro',
      UserData: {},
    })
  )
})

test('RDS Instance, its Proxy, and Secret for the password', () => {
  const stack = createStack()

  expectCDK(stack).to(
    haveResourceLike('AWS::SecretsManager::SecretTargetAttachment', {
      TargetType: 'AWS::RDS::DBInstance',
    })
  )

  expectCDK(stack).to(
    haveResourceLike('AWS::RDS::DBSubnetGroup', {
      DBSubnetGroupName: 'rds-subnet-group',
    })
  )

  expectCDK(stack).to(
    haveResourceLike('AWS::RDS::DBInstance', {
      DBInstanceClass: 'db.t2.micro',
      AllocatedStorage: '20',
      AutoMinorVersionUpgrade: false,
      CopyTagsToSnapshot: true,
      DBName: 'postgres',
      Engine: 'postgres',
      EngineVersion: '11.9',
      StorageType: 'gp2',
    })
  )

  expectCDK(stack).to(
    haveResourceLike('AWS::RDS::DBProxy', {
      Auth: [
        {
          AuthScheme: 'SECRETS',
          IAMAuth: 'DISABLED',
        },
      ],
      DBProxyName: 'db-proxy',
      EngineFamily: 'POSTGRESQL',
      IdleClientTimeout: 3600,
      RequireTLS: false,
    })
  )

  expectCDK(stack).to(
    haveResourceLike('AWS::RDS::DBProxyTargetGroup', {
      DBProxyName: {},
      TargetGroupName: 'default',
      ConnectionPoolConfigurationInfo: {
        MaxConnectionsPercent: 100,
      },
    })
  )
})

function createStack() {
  const stackName = 'RDSVpcStack'
  const app = new cdk.App()
  return new RdsVpcSetup.RdsVpcSetupStack(app, stackName, {
    env: { region: envs.REGION, account: envs.ACCOUNT_ID },
  })
}
