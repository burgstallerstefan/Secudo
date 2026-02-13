import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { canEditProjectMembershipRole, canUserViewProject } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';
import { PROJECT_NORMS, normalizeSelectableProjectNorms, serializeProjectNorms } from '@/lib/project-norm';
import {
  PROJECT_TRASH_RETENTION_DAYS,
  getProjectTrashExpiry,
  purgeExpiredDeletedProjects,
  supportsProjectDeletedAt,
} from '@/lib/project-trash';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  norm: z.string().optional(),
  norms: z.array(z.enum(PROJECT_NORMS)).optional(),
  minRoleToView: z.enum(['any', 'user', 'admin', 'private', 'viewer', 'editor']).optional(),
});

// GET /api/projects/[projectId]
export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    const projectId = params.projectId;
    const activeProjectWhere = supportsProjectDeletedAt()
      ? { id: projectId, deletedAt: null }
      : { id: projectId };

    const project = await prisma.project.findFirst({
      where: activeProjectWhere,
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
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const membership = project.members.find((member) => member.userId === userId);
    if (!canUserViewProject(project.minRoleToView, membership?.role, session.user?.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    const creatorUserId = project.members[0]?.userId ?? null;
    const canManageSettings =
      isGlobalAdmin(session.user?.role) ||
      membership?.role === 'Admin' ||
      creatorUserId === userId;
    return NextResponse.json({
      ...project,
      canEdit: isGlobalAdmin(session.user?.role) || canEditProjectMembershipRole(membership?.role),
      canManageSettings,
      canDelete:
        isGlobalAdmin(session.user?.role) ||
        membership?.role === 'Admin' ||
        creatorUserId === userId,
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get project error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[projectId]
export async function PUT(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    const projectId = params.projectId;
    const activeProjectWhere = supportsProjectDeletedAt()
      ? { id: projectId, deletedAt: null }
      : { id: projectId };

    const activeProject = await prisma.project.findFirst({
      where: activeProjectWhere,
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

    if (!activeProject) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const membership = activeProject.members.find((member) => member.userId === userId);
    const creatorUserId = activeProject.members[0]?.userId ?? null;
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

    const body = await req.json();
    const { name, description, norm, norms, minRoleToView } = UpdateProjectSchema.parse(body);
    const normalizedMinRoleToView = minRoleToView === 'user' ? 'editor' : minRoleToView;
    const normalizedNorm =
      norm !== undefined || norms !== undefined
        ? serializeProjectNorms(normalizeSelectableProjectNorms(norms, norm))
        : undefined;

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(normalizedNorm !== undefined && { norm: normalizedNorm }),
        ...(normalizedMinRoleToView && { minRoleToView: normalizedMinRoleToView }),
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Update project error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    const projectId = params.projectId;
    const permanentDeleteRequested = request.nextUrl.searchParams.get('permanent') === 'true';
    const hasTrashSupport = supportsProjectDeletedAt();
    await purgeExpiredDeletedProjects();
    const projectWhere = hasTrashSupport
      ? permanentDeleteRequested
        ? { id: projectId, deletedAt: { not: null } }
        : { id: projectId, deletedAt: null }
      : { id: projectId };

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
      return NextResponse.json(
        { error: permanentDeleteRequested ? 'Project not found in Recycle Bin' : 'Project not found' },
        { status: 404 }
      );
    }

    const creatorUserId = project.members[0]?.userId ?? null;
    const membership = project.members.find((member) => member.userId === userId);
    if (
      !isGlobalAdmin(session.user?.role) &&
      creatorUserId !== userId &&
      membership?.role !== 'Admin'
    ) {
      return NextResponse.json(
        { error: 'Not authorized (Project creator, project Admin, or global Admin required)' },
        { status: 403 }
      );
    }

    if (!hasTrashSupport || permanentDeleteRequested) {
      await prisma.project.delete({
        where: { id: projectId },
      });
      return NextResponse.json({
        success: true,
        projectId,
        deletedAt: null,
        expiresAt: null,
        retentionDays: 0,
        permanentlyDeleted: true,
      });
    }

    const deletedAt = new Date();
    const trashedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        deletedAt,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    const expiresAt = getProjectTrashExpiry(deletedAt);
    return NextResponse.json({
      success: true,
      projectId: trashedProject.id,
      deletedAt: trashedProject.deletedAt,
      expiresAt,
      retentionDays: PROJECT_TRASH_RETENTION_DAYS,
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Delete project error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
