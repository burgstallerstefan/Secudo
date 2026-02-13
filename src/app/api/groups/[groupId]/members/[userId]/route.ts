import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGlobalAdmin } from '@/lib/user-role';

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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { groupId: string; userId: string } }
) {
  try {
    const session = await requireAuth();
    const currentUserId = session.user?.id;

    if (!currentUserId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!isGlobalAdmin(session.user?.role)) {
      return NextResponse.json({ error: 'Only Admin can manage groups' }, { status: 403 });
    }

    const group = await prisma.userGroup.findUnique({
      where: { id: params.groupId },
      select: { id: true },
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const deletion = await prisma.userGroupMembership.deleteMany({
      where: {
        groupId: params.groupId,
        userId: params.userId,
      },
    });

    if (deletion.count === 0) {
      return NextResponse.json({ error: 'User is not in this group' }, { status: 404 });
    }

    const updatedGroup = await prisma.userGroup.findUnique({
      where: { id: params.groupId },
      include: GROUP_INCLUDE,
    });

    if (!updatedGroup) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json(updatedGroup);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Remove group member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

