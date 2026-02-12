import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const UpdateDataObjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  dataClass: z
    .enum([
      'Credentials',
      'PersonalData',
      'SafetyRelevant',
      'ProductionData',
      'Telemetry',
      'Logs',
      'IntellectualProperty',
      'Configuration',
      'Other',
    ])
    .optional(),
  confidentiality: z.number().int().min(1).max(10).optional(),
  integrity: z.number().int().min(1).max(10).optional(),
  availability: z.number().int().min(1).max(10).optional(),
  tags: z.string().optional(),
});

async function getMembership(projectId: string, userId: string) {
  return prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; dataObjectId: string } }
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

    const dataObject = await prisma.dataObject.findUnique({
      where: { id: params.dataObjectId },
      include: {
        componentData: { include: { node: true } },
        edgeDataFlows: { include: { edge: true } },
      },
    });
    if (!dataObject || dataObject.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Data object not found' }, { status: 404 });
    }

    return NextResponse.json(dataObject);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get data object error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; dataObjectId: string } }
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

    const existing = await prisma.dataObject.findUnique({
      where: { id: params.dataObjectId },
    });
    if (!existing || existing.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Data object not found' }, { status: 404 });
    }

    const payload = await request.json();
    const data = UpdateDataObjectSchema.parse(payload);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const updated = await prisma.dataObject.update({
      where: { id: params.dataObjectId },
      data,
      include: {
        componentData: true,
        edgeDataFlows: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Update data object error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { projectId: string; dataObjectId: string } }
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

    const existing = await prisma.dataObject.findUnique({
      where: { id: params.dataObjectId },
    });
    if (!existing || existing.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Data object not found' }, { status: 404 });
    }

    await prisma.dataObject.delete({
      where: { id: params.dataObjectId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete data object error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
