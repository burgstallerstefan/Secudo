import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGlobalAdmin } from '@/lib/user-role';
import { supportsProjectDeletedAt } from '@/lib/project-trash';

export async function POST(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (!supportsProjectDeletedAt()) {
      return NextResponse.json({ error: 'Project trash is not available in this runtime' }, { status: 400 });
    }

    const trashedProject = await prisma.project.findFirst({
      where: {
        id: params.projectId,
        deletedAt: {
          not: null,
        },
      },
      select: {
        id: true,
        members: {
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            userId: true,
            role: true,
          },
        },
      },
    });

    if (!trashedProject) {
      return NextResponse.json({ error: 'Project not found in trash' }, { status: 404 });
    }

    const creatorUserId = trashedProject.members[0]?.userId ?? null;
    const membership = trashedProject.members.find((member) => member.userId === userId);
    const canRestore =
      isGlobalAdmin(session.user?.role) ||
      creatorUserId === userId ||
      membership?.role === 'Admin';

    if (!canRestore) {
      return NextResponse.json(
        { error: 'Not authorized (Project creator, project Admin, or global Admin required)' },
        { status: 403 }
      );
    }

    await prisma.project.update({
      where: { id: trashedProject.id },
      data: {
        deletedAt: null,
      },
    });

    return NextResponse.json({ success: true, projectId: trashedProject.id });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Restore project error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
