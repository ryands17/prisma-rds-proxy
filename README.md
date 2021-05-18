# Prisma with RDS Proxy

This is an [aws-cdk](https://aws.amazon.com/cdk/) project where you deploy an API via API Gateway and Lambda that uses Prisma and RDS Proxy.

## Steps

1. Rename the `.example.env` file to `.env` and replace the `REGION` and `AWS_ACCOUNT_ID` with the values required for your stack.

2. Create the file `cdk.context.json` and add the following contents:

```json
{
  "keyname": "ec2-keypair",
  "@aws-cdk/core:newStyleStackSynthesis": true
}
```

3. Replace the `keyname` value to the keypair of your choice. If you do not have a keypair, you would need to create one from the EC2 console.

**_Note_**: All the env variables and context are mandatory! Without that, the stack wont work.

3. Run `yarn` (recommended) or `npm install`

4. Run `yarn cdk deploy --profile profileName` to deploy the stack to your specified region. You can skip providing the profile name if it's the `default`.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

5. Run the following command to get your database locally. Replace the _rds-host_, _ec2-ip-address_, and _ec2-keypair_ placeholders with your database host, EC2 public IP, and Keypair passed/created above respectively.

```sh
ssh -N -L 5432:rds-host:5432 ec2-user@ec2-ip-address -i ec2-keypair.pem -v
```

6. In your `.env`, update the _password_ placeholder in `DATABASE_URL` with the password obtained from Secrets Manager in the AWS Console.

7. Run `yarn prisma db push` to create the database and schema.

8. Run `yarn prisma db seed --preview-feature` to add the sample data.

9. Open the API URL obtained in the terminal output after you have run CDK deploy in the console.

## Useful commands

- `yarn watch` watch for changes and compile
- `yarn test` perform the jest unit tests
- `yarn cdk deploy` deploy this stack to your default AWS account/region
- `yarn cdk diff` compare deployed stack with current state
- `yarn cdk synth` emits the synthesized CloudFormation template
