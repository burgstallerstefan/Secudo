import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGlobalAdmin } from '@/lib/user-role';
import { EVERYONE_GROUP_NAME, isEveryoneGroupName } from '@/lib/system-groups';

const GROUP_INCLUDE = {
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
      firstName: true,
      lastName: true,
    },
  },
  members: {
    orderBy: { addedAt: 'asc' as const },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          name: true,
          role: true,
          createdAt: true,
        },
      },
    },
  },
} as const;

const CreateGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  userIds: z.array(z.string().trim().min(1)).optional().default([]),
});

export async function GET(_request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!isGlobalAdmin(session.user?.role)) {
      return NextResponse.json({ error: 'Only Admin can manage groups' }, { status: 403 });
    }

    const groups = await prisma.userGroup.findMany({
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      include: GROUP_INCLUDE,
    });

    return NextResponse.json(groups);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get groups error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!isGlobalAdmin(session.user?.role)) {
      return NextResponse.json({ error: 'Only Admin can manage groups' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, userIds } = CreateGroupSchema.parse(body);

    if (isEveryoneGroupName(name)) {
      return NextResponse.json(
        { error: `Group name "${EVERYONE_GROUP_NAME}" is reserved` },
        { status: 400 }
      );
    }

    const normalizedUserIds = Array.from(new Set(userIds.map((value) => value.trim()).filter(Boolean)));

    if (normalizedUserIds.length > 0) {
      const existingUsers = await prisma.user.count({
        where: {
          id: {
            in: normalizedUserIds,
          },
        },
      });

      if (existingUsers !== normalizedUserIds.length) {
        return NextResponse.json({ error: 'One or more selected users do not exist' }, { status: 400 });
      }
    }

    const group = await prisma.$transaction(async (tx) => {
      const createdGroup = await tx.userGroup.create({
        data: {
          name,
          description: description?.trim() || null,
          createdByUserId: userId,
        },
      });

      if (normalizedUserIds.length > 0) {
        await tx.userGroupMembership.createMany({
          data: normalizedUserIds.map((selectedUserId) => ({
            groupId: createdGroup.id,
            userId: selectedUserId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.userGroup.findUnique({
        where: { id: createdGroup.id },
        include: GROUP_INCLUDE,
      });
    });

    if (!group) {
      return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
    }

    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'Group name already exists' }, { status: 409 });
    }

    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Create group error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
