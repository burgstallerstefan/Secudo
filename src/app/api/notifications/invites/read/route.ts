import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(_request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const seenAt = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          inviteNotificationsSeenAt: seenAt,
        },
      }),
      prisma.userNotification.updateMany({
        where: {
          recipientUserId: userId,
          readAt: null,
        },
        data: {
          readAt: seenAt,
        },
      }),
    ]);

    return NextResponse.json({ success: true, seenAt });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Mark invite notifications read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
