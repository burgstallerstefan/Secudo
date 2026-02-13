import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { supportsProjectDeletedAt } from '@/lib/project-trash';

type InviteNotificationRole = 'Admin' | 'Editor' | 'Viewer' | 'User' | 'Unknown';

const normalizeInviteRole = (value: string | null | undefined): InviteNotificationRole => {
  const normalized = (value || '').toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'editor') return 'Editor';
  if (normalized === 'viewer') return 'Viewer';
  if (normalized === 'user') return 'User';
  return 'Unknown';
};

const buildInviteMessage = (projectName: string, role: InviteNotificationRole): string => {
  if (role === 'Viewer') {
    return `You were invited to view "${projectName}".`;
  }
  return `You were invited to collaborate on "${projectName}".`;
};

const buildProjectLink = (projectId: string): string => `/projects/${projectId}`;

async function syncProjectInviteNotifications(userId: string): Promise<void> {
  const memberships = await prisma.projectMembership.findMany({
    where: {
      userId,
      ...(supportsProjectDeletedAt() ? { project: { deletedAt: null } } : {}),
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          members: {
            orderBy: {
              createdAt: 'asc',
            },
            take: 1,
            select: {
              userId: true,
            },
          },
        },
      },
    },
    take: 200,
  });

  const existingInviteNotifications = await prisma.userNotification.findMany({
    where: {
      recipientUserId: userId,
      type: 'ProjectInvite',
      projectId: {
        not: null,
      },
    },
    select: {
      projectId: true,
    },
  });

  const existingProjectIds = new Set(
    existingInviteNotifications
      .map((entry) => entry.projectId)
      .filter((projectId): projectId is string => Boolean(projectId))
  );

  const notificationsToCreate = memberships
    .filter((membership) => {
      const creatorUserId = membership.project.members[0]?.userId ?? null;
      if (creatorUserId === userId) {
        return false;
      }
      return !existingProjectIds.has(membership.projectId);
    })
    .map((membership) => {
      const role = normalizeInviteRole(membership.role);
      return {
        recipientUserId: userId,
        actorUserId: null,
        projectId: membership.projectId,
        type: 'ProjectInvite',
        message: buildInviteMessage(membership.project.name, role),
        link: buildProjectLink(membership.projectId),
        createdAt: membership.createdAt,
      };
    });

  if (notificationsToCreate.length > 0) {
    await prisma.userNotification.createMany({
      data: notificationsToCreate,
    });
  }
}

export async function GET(_request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    await syncProjectInviteNotifications(userId);

    const notifications = await prisma.userNotification.findMany({
      where: {
        recipientUserId: userId,
        ...(supportsProjectDeletedAt()
          ? {
              OR: [{ projectId: null }, { project: { deletedAt: null } }],
            }
          : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      take: 100,
    });

    const unreadCount = notifications.reduce((count, item) => (item.readAt ? count : count + 1), 0);

    return NextResponse.json({
      unreadCount,
      notifications: notifications.map((notification) => ({
        id: notification.id,
        projectId: notification.projectId || notification.project?.id || '',
        projectName: notification.project?.name || 'Project',
        role: notification.type,
        type: notification.type,
        createdAt: notification.createdAt,
        isUnread: !notification.readAt,
        message: notification.message,
        link: notification.link || (notification.projectId ? buildProjectLink(notification.projectId) : null),
      })),
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Get notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const result = await prisma.userNotification.deleteMany({
      where: {
        recipientUserId: userId,
      },
    });

    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Delete all notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
