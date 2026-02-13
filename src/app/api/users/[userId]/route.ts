import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isGlobalAdmin } from '@/lib/user-role';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await requireAuth();
    const currentUserId = session.user?.id;

    if (!currentUserId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!isGlobalAdmin(session.user?.role)) {
      return NextResponse.json({ error: 'Only Admin can delete users' }, { status: 403 });
    }

    const targetUserId = params.userId;

    if (targetUserId === currentUserId) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'Admin') {
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

    await prisma.$transaction(async (tx) => {
      await tx.answer.deleteMany({
        where: { userId: targetUserId },
      });

      await tx.user.delete({
        where: { id: targetUserId },
      });
    });

    return NextResponse.json({ success: true, deletedUserId: targetUserId });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
