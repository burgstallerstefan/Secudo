import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

const CreateNodeSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['Component', 'Human', 'System']),
  subtype: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  parentNodeId: z.string().nullable().optional(),
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

    if (!membership || (membership.role !== 'Editor' && membership.role !== 'Admin')) {
      return NextResponse.json(
        { error: 'Not authorized (Editor required)' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, category, subtype, description, notes, parentNodeId } = CreateNodeSchema.parse(body);

    // Generate stable ID
    const stableId = `${category.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Verify parent exists and belongs to same project if provided
    if (parentNodeId) {
      const parentNode = await prisma.modelNode.findUnique({
        where: { id: parentNodeId },
      });

      if (!parentNode || parentNode.projectId !== params.projectId) {
        return NextResponse.json(
          { error: 'Invalid parent node' },
          { status: 400 }
        );
      }

    }

    const node = await prisma.modelNode.create({
      data: {
        projectId: params.projectId,
        stableId,
        name,
        category,
        subtype,
        description,
        notes,
        parentNodeId,
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
