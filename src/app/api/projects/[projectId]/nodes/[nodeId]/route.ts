import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
import { wouldCreateHierarchyCycle } from '@/lib/model-hierarchy';
import { isGlobalAdmin } from '@/lib/user-role';

const UpdateNodeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  parentNodeId: z.string().nullable().optional(),
});

function normalizeCategory(rawCategory: string | undefined | null): 'Container' | 'Component' {
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
  return normalizeCategory(rawCategory) === 'Container';
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
  { params }: { params: { projectId: string; nodeId: string } }
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

    // Check authorization
    const membership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: params.projectId, userId } },
    });

    if (!membership && !isGlobalAdmin(session.user?.role)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    const node = await prisma.modelNode.findUnique({
      where: { id: params.nodeId },
      include: {
        childNodes: true,
        outgoingEdges: true,
        incomingEdges: true,
        dataComponents: true,
      },
    });

    if (!node || node.projectId !== params.projectId) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(node);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get node error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; nodeId: string } }
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

    // Check authorization
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
    const { name, description, notes, parentNodeId } = UpdateNodeSchema.parse(body);

    // Verify node exists and belongs to this project
    const node = await prisma.modelNode.findUnique({
      where: { id: params.nodeId },
    });

    if (!node || node.projectId !== params.projectId) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      );
    }

    let normalizedParentNodeId = parentNodeId;
    if (parentNodeId === null && normalizeCategory(node.category) === 'Component') {
      const globalContainer = await ensureGlobalContainer(params.projectId, userId);
      normalizedParentNodeId = globalContainer.id;
    }

    // Verify parent if provided
    if (normalizedParentNodeId && normalizedParentNodeId !== node.parentNodeId) {
      const parentNode = await prisma.modelNode.findUnique({
        where: { id: normalizedParentNodeId },
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

      const hasCycle = await wouldCreateHierarchyCycle(params.projectId, params.nodeId, normalizedParentNodeId);
      if (hasCycle) {
        return NextResponse.json(
          { error: 'Parent assignment would create a cycle' },
          { status: 409 }
        );
      }
    }

    if (normalizedParentNodeId === params.nodeId) {
      return NextResponse.json(
        { error: 'Node cannot be parent of itself' },
        { status: 400 }
      );
    }

    const updatedNode = await prisma.modelNode.update({
      where: { id: params.nodeId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(notes !== undefined && { notes }),
        ...(normalizedParentNodeId !== undefined && { parentNodeId: normalizedParentNodeId }),
        updatedByUserId: userId,
      },
      include: {
        childNodes: true,
        outgoingEdges: true,
        incomingEdges: true,
        dataComponents: true,
      },
    });

    return NextResponse.json(updatedNode);
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
    console.error('Update node error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { projectId: string; nodeId: string } }
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

    // Check authorization
    const membership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: params.projectId, userId } },
    });

    if (!isGlobalAdmin(session.user?.role) && (!membership || (membership.role !== 'Editor' && membership.role !== 'Admin'))) {
      return NextResponse.json(
        { error: 'Not authorized (Editor required)' },
        { status: 403 }
      );
    }

    // Verify node exists
    const node = await prisma.modelNode.findUnique({
      where: { id: params.nodeId },
    });

    if (!node || node.projectId !== params.projectId) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      );
    }

    // Delete node (cascades will handle related records)
    await prisma.modelNode.delete({
      where: { id: params.nodeId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Delete node error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
