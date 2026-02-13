import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeProjectMembershipRole } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';
import { supportsProjectDeletedAt } from '@/lib/project-trash';

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const projectWhere = supportsProjectDeletedAt()
      ? { id: params.projectId, deletedAt: null }
      : { id: params.projectId };

    const project = await prisma.project.findFirst({
      where: projectWhere,
      select: {
        id: true,
        members: {
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            userId: true,
            role: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const membership = project.members.find((member) => member.userId === userId);
    const creatorUserId = project.members[0]?.userId ?? null;
    const canManageSettings =
      isGlobalAdmin(session.user?.role) ||
      membership?.role === 'Admin' ||
      creatorUserId === userId;

    if (!canManageSettings) {
      return NextResponse.json(
        { error: 'Not authorized (Project creator, project Admin, or global Admin required)' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      creatorUserId,
      members: project.members.map((member) => ({
        userId: member.userId,
        role: normalizeProjectMembershipRole(member.role) ?? 'Viewer',
        isCreator: member.userId === creatorUserId,
        createdAt: member.createdAt,
        user: member.user,
      })),
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Get project members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
