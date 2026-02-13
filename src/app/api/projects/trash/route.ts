import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGlobalAdmin } from '@/lib/user-role';
import {
  PROJECT_TRASH_RETENTION_DAYS,
  getProjectTrashExpiry,
  purgeExpiredDeletedProjects,
  supportsProjectDeletedAt,
} from '@/lib/project-trash';

export async function GET(_request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    const globalRole = session.user?.role;

    if (!userId) {
      return NextResponse.json({ error: 'User not found in session' }, { status: 401 });
    }

    if (!supportsProjectDeletedAt()) {
      return NextResponse.json([]);
    }

    await purgeExpiredDeletedProjects();

    const trashedProjects = await prisma.project.findMany({
      where: isGlobalAdmin(globalRole)
        ? { deletedAt: { not: null } }
        : {
            deletedAt: { not: null },
            members: {
              some: {
                userId,
              },
            },
          },
      include: {
        members: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: {
        deletedAt: 'desc',
      },
    });

    const now = new Date();
    const response = trashedProjects.map((project) => {
      const creatorUserId = project.members[0]?.userId ?? null;
      const membership = project.members.find((member) => member.userId === userId);
      const canRestore =
        isGlobalAdmin(globalRole) ||
        membership?.role === 'Admin' ||
        creatorUserId === userId;
      const deletedAt = project.deletedAt as Date;
      const expiresAt = getProjectTrashExpiry(deletedAt);
      const millisLeft = Math.max(0, expiresAt.getTime() - now.getTime());
      const daysRemaining = Math.ceil(millisLeft / (24 * 60 * 60 * 1000));

      return {
        ...project,
        canRestore,
        expiresAt,
        daysRemaining,
        retentionDays: PROJECT_TRASH_RETENTION_DAYS,
      };
    });

    return NextResponse.json(response);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get trashed projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
