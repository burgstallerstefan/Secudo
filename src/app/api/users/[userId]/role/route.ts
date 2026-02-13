import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canManageUserRoles } from '@/lib/user-role';
import * as z from 'zod';

const UpdateUserRoleSchema = z.object({
  role: z.enum(['User', 'Admin']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await requireAuth();
    const currentUserId = session.user?.id;

    if (!currentUserId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!canManageUserRoles(session.user?.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { role } = UpdateUserRoleSchema.parse(body);
    const targetUserId = params.userId;

    const existingUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (existingUser.role === 'Admin' && role !== 'Admin') {
      const adminCount = await prisma.user.count({
        where: { role: 'Admin' },
      });

      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'At least one Admin user must remain' },
          { status: 400 }
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }

    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Update user role error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
