import { APIGatewayEvent, Context } from 'aws-lambda'
import { getDB } from './db'

export const handler = async (event: APIGatewayEvent, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false
  const db = await getDB()
  console.log(JSON.stringify(event, null, 2))
  let users = await db.user.findMany()
  console.log(JSON.stringify(users))

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { users } }),
  }
}
