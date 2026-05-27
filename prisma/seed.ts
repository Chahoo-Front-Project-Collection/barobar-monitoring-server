import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Demo 고객사', slug: 'demo' },
  });

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
  ];
  await prisma.apiKey.upsert({
    where: { publicKey: 'pub_demo' },
    update: { allowedOrigins },
    create: { tenantId: tenant.id, publicKey: 'pub_demo', allowedOrigins },
  });

  console.log('Seed complete. tenant:', tenant.slug);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
