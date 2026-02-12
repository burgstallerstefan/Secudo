import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const CreateComponentDataSchema = z.object({
  nodeId: z.string(),
  dataObjectId: z.string(),
  role: z.enum(['Stores', 'Processes', 'Generates', 'Receives']),
  notes: z.string().optional(),
});

const DeleteComponentDataSchema = z.object({
  nodeId: z.string(),
  dataObjectId: z.string(),
});

async function getMembership(projectId: string, userId: string) {
  return prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getMembership(params.projectId, userId);
    if (!membership) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const records = await prisma.componentData.findMany({
      where: {
        node: {
          projectId: params.projectId,
        },
      },
      include: {
        node: true,
        dataObject: true,
      },
    });

    return NextResponse.json(records);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get component-data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getMembership(params.projectId, userId);
    if (!membership || !['Admin', 'Editor'].includes(membership.role)) {
      return NextResponse.json({ error: 'Not authorized (Editor required)' }, { status: 403 });
    }

    const payload = await request.json();
    const data = CreateComponentDataSchema.parse(payload);

    const [node, dataObject] = await Promise.all([
      prisma.modelNode.findUnique({ where: { id: data.nodeId } }),
      prisma.dataObject.findUnique({ where: { id: data.dataObjectId } }),
    ]);

    if (!node || node.projectId !== params.projectId || !dataObject || dataObject.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Node or data object not in project' }, { status: 400 });
    }

    const record = await prisma.componentData.upsert({
      where: {
        nodeId_dataObjectId: {
          nodeId: data.nodeId,
          dataObjectId: data.dataObjectId,
        },
      },
      update: {
        role: data.role,
        notes: data.notes,
      },
      create: data,
      include: {
        node: true,
        dataObject: true,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Create component-data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getMembership(params.projectId, userId);
    if (!membership || !['Admin', 'Editor'].includes(membership.role)) {
      return NextResponse.json({ error: 'Not authorized (Editor required)' }, { status: 403 });
    }

    const payload = await request.json();
    const data = DeleteComponentDataSchema.parse(payload);

    const existing = await prisma.componentData.findUnique({
      where: { nodeId_dataObjectId: data },
      include: { node: true, dataObject: true },
    });
    if (!existing || existing.node.projectId !== params.projectId || existing.dataObject.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Component-data link not found' }, { status: 404 });
    }

    await prisma.componentData.delete({
      where: { nodeId_dataObjectId: data },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete component-data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
