#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import { RdsVpcSetupStack } from '../lib/rds-vpc-setup-stack'
import { envs } from './config'

const app = new cdk.App()
new RdsVpcSetupStack(app, 'RdsVpcSetupStack', {
  env: { region: envs.REGION, account: envs.ACCOUNT_ID },
})
