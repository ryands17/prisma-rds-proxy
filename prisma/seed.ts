import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  log: ['query'],
})

async function main() {
  for (let i = 0; i < 100; i++)
    await prisma.user.create({ data: { name: `user ${i}` } })
}

main()
  .catch(e => {
    console.error(e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
