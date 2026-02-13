import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
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

const AddGroupMemberSchema = z.object({
  userId: z.string().trim().min(1),
});

export async function POST(request: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const session = await requireAuth();
    const currentUserId = session.user?.id;

    if (!currentUserId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!isGlobalAdmin(session.user?.role)) {
      return NextResponse.json({ error: 'Only Admin can manage groups' }, { status: 403 });
    }

    const body = await request.json();
    const { userId } = AddGroupMemberSchema.parse(body);

    const [group, user] = await Promise.all([
      prisma.userGroup.findUnique({ where: { id: params.groupId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    ]);

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.userGroupMembership.create({
      data: {
        groupId: params.groupId,
        userId,
      },
    });

    const updatedGroup = await prisma.userGroup.findUnique({
      where: { id: params.groupId },
      include: GROUP_INCLUDE,
    });

    if (!updatedGroup) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json(updatedGroup);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'User is already in this group' }, { status: 409 });
    }

    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Add group member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

