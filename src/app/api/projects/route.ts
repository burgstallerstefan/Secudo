import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { canUserViewProject } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';
import { purgeExpiredDeletedProjects, supportsProjectDeletedAt } from '@/lib/project-trash';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

// Validation schemas
const CreateProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  norm: z.string().trim().default('IEC 62443'),
  minRoleToView: z.enum(['any', 'viewer', 'editor', 'admin', 'private']).default('any'),
});

// GET /api/projects - List user's projects
export async function GET(_request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User not found in session' },
        { status: 401 }
      );
    }

    const currentUserRole = session.user?.role;
    await purgeExpiredDeletedProjects();
    const activeFilter = supportsProjectDeletedAt() ? { deletedAt: null } : {};

    const projects = await prisma.project.findMany({
      where: isGlobalAdmin(currentUserRole)
        ? activeFilter
        : {
            ...activeFilter,
            OR: [
              { minRoleToView: 'any' },
              {
                members: {
                  some: {
                    userId,
                  },
                },
              },
            ],
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
      orderBy: { updatedAt: 'desc' },
    });

    const visibleProjects = projects
      .filter((project) => {
        const membership = project.members.find((member) => member.userId === userId);
        return canUserViewProject(project.minRoleToView, membership?.role, currentUserRole);
      })
      .map((project) => {
        const membership = project.members.find((member) => member.userId === userId);
        const creatorUserId = project.members[0]?.userId ?? null;
        return {
          ...project,
          canEdit:
            isGlobalAdmin(currentUserRole) ||
            membership?.role === 'Admin' ||
            membership?.role === 'Editor',
          canDelete:
            isGlobalAdmin(currentUserRole) ||
            membership?.role === 'Admin' ||
            creatorUserId === userId,
        };
      });
    
    if (visibleProjects.length === 0) {
      return NextResponse.json(visibleProjects);
    }

    const measureStatuses = await prisma.measure.findMany({
      where: {
        projectId: {
          in: visibleProjects.map((project) => project.id),
        },
      },
      select: {
        projectId: true,
        status: true,
      },
    });

    const progressByProjectId = new Map<string, { totalMeasures: number; completedMeasures: number }>();
    measureStatuses.forEach((measure) => {
      const current = progressByProjectId.get(measure.projectId) || {
        totalMeasures: 0,
        completedMeasures: 0,
      };
      current.totalMeasures += 1;
      if (measure.status === 'Done') {
        current.completedMeasures += 1;
      }
      progressByProjectId.set(measure.projectId, current);
    });

    const projectsWithProgress = visibleProjects.map((project) => {
      const progress = progressByProjectId.get(project.id) || {
        totalMeasures: 0,
        completedMeasures: 0,
      };
      const completionPercent =
        progress.totalMeasures > 0
          ? Math.round((progress.completedMeasures / progress.totalMeasures) * 100)
          : 0;

      return {
        ...project,
        totalMeasures: progress.totalMeasures,
        completedMeasures: progress.completedMeasures,
        completionPercent,
      };
    });

    return NextResponse.json(projectsWithProgress);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get projects error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create new project
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User not found in session' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, description, norm, minRoleToView } = CreateProjectSchema.parse(body);
    const normalizedDescription = description?.trim() || null;
    const normalizedNorm = norm.trim() || 'IEC 62443';

    // Create project
    const project = await prisma.project.create({
      data: {
        name,
        description: normalizedDescription,
        norm: normalizedNorm,
        minRoleToView,
        members: {
          create: {
            userId,
            role: 'Admin',
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
    });

    return NextResponse.json(project, { status: 201 });
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
    console.error('Create project error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
