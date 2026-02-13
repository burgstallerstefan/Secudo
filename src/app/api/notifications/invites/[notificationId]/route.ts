import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { notificationId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const notification = await prisma.userNotification.findUnique({
      where: {
        id: params.notificationId,
      },
      select: {
        id: true,
        recipientUserId: true,
      },
    });

    if (!notification || notification.recipientUserId !== userId) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    await prisma.userNotification.delete({
      where: {
        id: params.notificationId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Delete notification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
