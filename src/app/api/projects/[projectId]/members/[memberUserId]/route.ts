import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isGlobalAdmin } from '@/lib/user-role';
import { normalizeProjectMembershipRole } from '@/lib/project-access';
import { supportsProjectDeletedAt } from '@/lib/project-trash';

const updateRoleSchema = z.object({
  role: z
    .enum(['Viewer', 'Editor', 'Admin', 'User'])
    .transform((role) => {
      if (role === 'User') {
        return 'Editor';
      }
      return role;
    }),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; memberUserId: string } }
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

    const targetMembership = project.members.find((member) => member.userId === params.memberUserId);
    if (!targetMembership) {
      return NextResponse.json({ error: 'Project member not found' }, { status: 404 });
    }

    if (
      targetMembership.userId === creatorUserId &&
      !isGlobalAdmin(session.user?.role) &&
      creatorUserId !== userId
    ) {
      return NextResponse.json(
        { error: 'Only the project creator or global Admin can change creator role' },
        { status: 403 }
      );
    }

    const payload = await request.json();
    const parsed = updateRoleSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updatedMembership = await prisma.projectMembership.update({
      where: {
        projectId_userId: {
          projectId: params.projectId,
          userId: params.memberUserId,
        },
      },
      data: {
        role: parsed.data.role,
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
    });

    const normalizedRole = normalizeProjectMembershipRole(updatedMembership.role) ?? 'Viewer';
    return NextResponse.json({
      ...updatedMembership,
      role: normalizedRole,
      isCreator: updatedMembership.userId === creatorUserId,
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Update project member role error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
