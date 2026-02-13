/**
 * Prisma Database Seed
 * Run with: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean up (optional)
  // await prisma.user.deleteMany();

  // Create test user
  const hashedPassword = await bcrypt.hash('Secudo123!', 10);

  const testUser = await prisma.user.create({
    data: {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      name: 'Test User',
      password: hashedPassword,
      jobTitle: 'Security Engineer',
      company: 'Test Company',
      role: 'User',
    },
  });

  console.log('✅ Seeding complete');
  console.log(`✨ Test user created: ${testUser.email}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
