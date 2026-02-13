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

const UpdateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: 'At least one field must be provided',
  });

export async function PATCH(request: NextRequest, { params }: { params: { groupId: string } }) {
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
    const { name, description } = UpdateGroupSchema.parse(body);

    if (name !== undefined && isEveryoneGroupName(name)) {
      return NextResponse.json(
        { error: `Group name "${EVERYONE_GROUP_NAME}" is reserved` },
        { status: 400 }
      );
    }

    const updatedGroup = await prisma.userGroup.update({
      where: { id: params.groupId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description.trim() || null } : {}),
      },
      include: GROUP_INCLUDE,
    });

    return NextResponse.json(updatedGroup);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    if ((error as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'Group name already exists' }, { status: 409 });
    }

    if ((error as { code?: string })?.code === 'P2025') {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Update group error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!isGlobalAdmin(session.user?.role)) {
      return NextResponse.json({ error: 'Only Admin can manage groups' }, { status: 403 });
    }

    await prisma.userGroup.delete({
      where: { id: params.groupId },
    });

    return NextResponse.json({ success: true, deletedGroupId: params.groupId });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Delete group error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
