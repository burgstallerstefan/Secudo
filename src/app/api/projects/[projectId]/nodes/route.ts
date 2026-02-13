import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

const CreateNodeSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  parentNodeId: z.string().nullable().optional(),
});

function normalizeCategory(rawCategory: string | undefined): 'Container' | 'Component' {
  if (!rawCategory) {
    return 'Component';
  }

  const value = rawCategory.trim().toLowerCase();
  if (value === 'container' || value === 'system') {
    return 'Container';
  }

  return 'Component';
}

function isContainerCategory(rawCategory: string | undefined | null): boolean {
  return normalizeCategory(rawCategory || undefined) === 'Container';
}

async function ensureGlobalContainer(projectId: string, userId: string) {
  const existing = await prisma.modelNode.findFirst({
    where: {
      projectId,
      category: 'Container',
      name: {
        equals: 'Global',
        mode: 'insensitive',
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  if (existing) {
    return existing;
  }

  const stableId = `container_global_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return prisma.modelNode.create({
    data: {
      projectId,
      stableId,
      name: 'Global',
      category: 'Container',
      createdByUserId: userId,
      updatedByUserId: userId,
    },
  });
}

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

    const access = await getProjectViewAccess(params.projectId, userId, session.user?.role);
    if (!access.exists) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (!access.canView) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    const nodes = await prisma.modelNode.findMany({
      where: { projectId: params.projectId },
      include: {
        childNodes: true,
        outgoingEdges: true,
        incomingEdges: true,
        dataComponents: true,
      },
    });

    return NextResponse.json(nodes);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get nodes error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
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

    // Check authorization (Editor or Admin)
    const membership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: params.projectId, userId } },
    });

    if (!isGlobalAdmin(session.user?.role) && (!membership || (membership.role !== 'Editor' && membership.role !== 'Admin'))) {
      return NextResponse.json(
        { error: 'Not authorized (Editor required)' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, category, description, notes, parentNodeId } = CreateNodeSchema.parse(body);
    const normalizedCategory = normalizeCategory(category);

    // Generate stable ID
    const stableId = `${normalizedCategory.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    let resolvedParentNodeId = parentNodeId || null;

    // Verify parent exists and belongs to same project if provided
    if (resolvedParentNodeId) {
      const parentNode = await prisma.modelNode.findUnique({
        where: { id: resolvedParentNodeId },
      });

      if (!parentNode || parentNode.projectId !== params.projectId) {
        return NextResponse.json(
          { error: 'Invalid parent node' },
          { status: 400 }
        );
      }

      if (!isContainerCategory(parentNode.category)) {
        return NextResponse.json(
          { error: 'Parent node must be a container' },
          { status: 400 }
        );
      }
    }

    // Components without parent are assigned to the global container.
    if (normalizedCategory === 'Component' && !resolvedParentNodeId) {
      const globalContainer = await ensureGlobalContainer(params.projectId, userId);
      resolvedParentNodeId = globalContainer.id;
    }

    const node = await prisma.modelNode.create({
      data: {
        projectId: params.projectId,
        stableId,
        name,
        category: normalizedCategory,
        description,
        notes,
        parentNodeId: resolvedParentNodeId,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      include: {
        childNodes: true,
        outgoingEdges: true,
        incomingEdges: true,
        dataComponents: true,
      },
    });

    return NextResponse.json(node, { status: 201 });
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
    console.error('Create node error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
