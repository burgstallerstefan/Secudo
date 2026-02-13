import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';

const INITIAL_ADMIN_EMAIL = 'admin@admin.com';
const INITIAL_ADMIN_PASSWORD = 'Secudo4TheWin';
const LEGACY_INITIAL_ADMIN_PASSWORDS = [
  'Secudo!Admin!4TheWin',
  'secudo!Admin!4TheWin',
  'Testudo!Admin!4TheWin',
  'testudo!Admin!4TheWin',
];
const INITIAL_ADMIN_FIRST_NAME = 'Admin';
const INITIAL_ADMIN_LAST_NAME = 'Admin';

let ensureInFlight: Promise<void> | null = null;

async function ensureInitialAdminUserInternal(): Promise<void> {
  const existingUser = await prisma.user.findUnique({
    where: { email: INITIAL_ADMIN_EMAIL },
    select: {
      id: true,
      role: true,
      password: true,
      firstName: true,
      lastName: true,
      name: true,
    },
  });

  if (!existingUser) {
    const hashedPassword = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 10);
    await prisma.user.create({
      data: {
        email: INITIAL_ADMIN_EMAIL,
        password: hashedPassword,
        firstName: INITIAL_ADMIN_FIRST_NAME,
        lastName: INITIAL_ADMIN_LAST_NAME,
        name: `${INITIAL_ADMIN_FIRST_NAME} ${INITIAL_ADMIN_LAST_NAME}`,
        role: 'Admin',
        jobTitle: 'Administrator',
      },
    });
    return;
  }

  const updates: Record<string, string> = {};

  if (existingUser.role !== 'Admin') {
    updates.role = 'Admin';
  }

  if (!existingUser.password) {
    updates.password = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 10);
  } else {
    const isExpectedPassword = await bcrypt.compare(INITIAL_ADMIN_PASSWORD, existingUser.password);
    let shouldUpgradeFromLegacyPassword = false;

    if (!isExpectedPassword) {
      for (const legacyPassword of LEGACY_INITIAL_ADMIN_PASSWORDS) {
        if (await bcrypt.compare(legacyPassword, existingUser.password)) {
          shouldUpgradeFromLegacyPassword = true;
          break;
        }
      }
    }

    if (shouldUpgradeFromLegacyPassword) {
      updates.password = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 10);
    }
  }

  if (!existingUser.firstName) {
    updates.firstName = INITIAL_ADMIN_FIRST_NAME;
  }

  if (!existingUser.lastName) {
    updates.lastName = INITIAL_ADMIN_LAST_NAME;
  }

  if (!existingUser.name) {
    updates.name = `${INITIAL_ADMIN_FIRST_NAME} ${INITIAL_ADMIN_LAST_NAME}`;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: updates,
    });
  }
}

export async function ensureInitialAdminUser(): Promise<void> {
  if (!ensureInFlight) {
    ensureInFlight = ensureInitialAdminUserInternal().finally(() => {
      ensureInFlight = null;
    });
  }

  await ensureInFlight;
}
