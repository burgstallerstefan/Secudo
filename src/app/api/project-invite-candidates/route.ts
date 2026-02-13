import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { EVERYONE_GROUP_DESCRIPTION, EVERYONE_GROUP_ID, EVERYONE_GROUP_NAME } from '@/lib/system-groups';
import { normalizeGlobalRole } from '@/lib/user-role';

export async function GET(_request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const [users, groups] = await Promise.all([
      prisma.user.findMany({
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          name: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.userGroup.findMany({
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          description: true,
          _count: {
            select: {
              members: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      users: users.map((user) => ({
        ...user,
        role: normalizeGlobalRole(user.role),
      })),
      groups: [
        {
          id: EVERYONE_GROUP_ID,
          name: EVERYONE_GROUP_NAME,
          description: EVERYONE_GROUP_DESCRIPTION,
          memberCount: users.length,
        },
        ...groups.map((group) => ({
          id: group.id,
          name: group.name,
          description: group.description,
          memberCount: group._count.members,
        })),
      ],
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Get project invite candidates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
