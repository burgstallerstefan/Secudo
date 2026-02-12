import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const CreateEdgeDataFlowSchema = z.object({
  edgeId: z.string(),
  dataObjectId: z.string(),
  direction: z.enum(['SourceToTarget', 'TargetToSource', 'Bidirectional']).default('SourceToTarget'),
  notes: z.string().optional(),
});

const DeleteEdgeDataFlowSchema = z.object({
  edgeId: z.string(),
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

    const records = await prisma.edgeDataFlow.findMany({
      where: {
        edge: {
          projectId: params.projectId,
        },
      },
      include: {
        edge: true,
        dataObject: true,
      },
    });

    return NextResponse.json(records);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get edge-data-flows error:', error);
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
    const data = CreateEdgeDataFlowSchema.parse(payload);

    const [edge, dataObject] = await Promise.all([
      prisma.modelEdge.findUnique({ where: { id: data.edgeId } }),
      prisma.dataObject.findUnique({ where: { id: data.dataObjectId } }),
    ]);

    if (!edge || edge.projectId !== params.projectId || !dataObject || dataObject.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Edge or data object not in project' }, { status: 400 });
    }

    const record = await prisma.edgeDataFlow.upsert({
      where: {
        edgeId_dataObjectId: {
          edgeId: data.edgeId,
          dataObjectId: data.dataObjectId,
        },
      },
      update: {
        direction: data.direction,
        notes: data.notes,
      },
      create: data,
      include: {
        edge: true,
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
    console.error('Create edge-data-flow error:', error);
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
    const data = DeleteEdgeDataFlowSchema.parse(payload);

    const existing = await prisma.edgeDataFlow.findUnique({
      where: { edgeId_dataObjectId: data },
      include: { edge: true, dataObject: true },
    });
    if (!existing || existing.edge.projectId !== params.projectId || existing.dataObject.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Edge-data-flow link not found' }, { status: 404 });
    }

    await prisma.edgeDataFlow.delete({
      where: { edgeId_dataObjectId: data },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete edge-data-flow error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
