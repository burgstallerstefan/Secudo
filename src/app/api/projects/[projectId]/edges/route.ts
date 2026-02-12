import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

const CreateEdgeSchema = z.object({
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  name: z.string().optional(),
  direction: z.enum(['A_TO_B', 'B_TO_A', 'BIDIRECTIONAL']).default('A_TO_B'),
  protocol: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

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

    // Check authorization
    const membership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: params.projectId, userId } },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    const edges = await prisma.modelEdge.findMany({
      where: { projectId: params.projectId },
      include: {
        sourceNode: true,
        targetNode: true,
        dataFlows: true,
      },
    });

    return NextResponse.json(edges);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get edges error:', error);
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

    // Check authorization
    const membership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: params.projectId, userId } },
    });

    if (!membership || (membership.role !== 'Editor' && membership.role !== 'Admin')) {
      return NextResponse.json(
        { error: 'Not authorized (Editor required)' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { sourceNodeId, targetNodeId, name, direction, protocol, description, notes } = CreateEdgeSchema.parse(body);

    if (sourceNodeId === targetNodeId) {
      return NextResponse.json(
        { error: 'Source and target must be different nodes' },
        { status: 400 }
      );
    }

    // Verify both nodes exist and belong to this project
    const [sourceNode, targetNode] = await Promise.all([
      prisma.modelNode.findUnique({ where: { id: sourceNodeId } }),
      prisma.modelNode.findUnique({ where: { id: targetNodeId } }),
    ]);

    if (!sourceNode || sourceNode.projectId !== params.projectId || !targetNode || targetNode.projectId !== params.projectId) {
      return NextResponse.json(
        { error: 'Invalid source or target node' },
        { status: 400 }
      );
    }

    const existingEdge = await prisma.modelEdge.findFirst({
      where: {
        projectId: params.projectId,
        sourceNodeId,
        targetNodeId,
      },
    });
    if (existingEdge) {
      return NextResponse.json(
        { error: 'Edge already exists' },
        { status: 409 }
      );
    }

    const edge = await prisma.modelEdge.create({
      data: {
        projectId: params.projectId,
        sourceNodeId,
        targetNodeId,
        name,
        direction,
        protocol,
        description,
        notes,
        createdByUserId: userId,
      },
      include: {
        sourceNode: true,
        targetNode: true,
        dataFlows: true,
      },
    });

    return NextResponse.json(edge, { status: 201 });
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
    console.error('Create edge error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
