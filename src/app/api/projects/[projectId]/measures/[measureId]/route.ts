import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGlobalAdmin } from '@/lib/user-role';

const UpdateMeasureSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  status: z.enum(['Open', 'InProgress', 'Done']).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional().nullable(),
});

async function getMembership(projectId: string, userId: string) {
  return prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; measureId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getMembership(params.projectId, userId);
    if (!isGlobalAdmin(session.user?.role) && !membership) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const measure = await prisma.measure.findUnique({
      where: { id: params.measureId },
      include: { finding: true },
    });

    if (!measure || measure.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Measure not found' }, { status: 404 });
    }

    return NextResponse.json(measure);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get measure error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; measureId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getMembership(params.projectId, userId);
    if (!isGlobalAdmin(session.user?.role) && (!membership || !['Admin', 'Editor'].includes(membership.role))) {
      return NextResponse.json({ error: 'Not authorized (Editor required)' }, { status: 403 });
    }

    const existing = await prisma.measure.findUnique({
      where: { id: params.measureId },
    });
    if (!existing || existing.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Measure not found' }, { status: 404 });
    }

    const payload = await request.json();
    const data = UpdateMeasureSchema.parse(payload);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const updateData: {
      title?: string;
      description?: string;
      priority?: 'Low' | 'Medium' | 'High' | 'Critical';
      status?: 'Open' | 'InProgress' | 'Done';
      assignedTo?: string | null;
      dueDate?: Date | null;
    } = {};

    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.priority !== undefined) {
      updateData.priority = data.priority;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    if (Object.prototype.hasOwnProperty.call(data, 'assignedTo')) {
      updateData.assignedTo = data.assignedTo?.trim() || null;
    }

    if (Object.prototype.hasOwnProperty.call(data, 'dueDate')) {
      if (!data.dueDate) {
        updateData.dueDate = null;
      } else {
        const parsedDueDate = new Date(data.dueDate);
        if (Number.isNaN(parsedDueDate.getTime())) {
          return NextResponse.json({ error: 'Invalid dueDate' }, { status: 400 });
        }
        updateData.dueDate = parsedDueDate;
      }
    }

    const updated = await prisma.measure.update({
      where: { id: params.measureId },
      data: updateData,
      include: { finding: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Update measure error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { projectId: string; measureId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getMembership(params.projectId, userId);
    if (!isGlobalAdmin(session.user?.role) && (!membership || !['Admin', 'Editor'].includes(membership.role))) {
      return NextResponse.json({ error: 'Not authorized (Editor required)' }, { status: 403 });
    }

    const existing = await prisma.measure.findUnique({
      where: { id: params.measureId },
    });
    if (!existing || existing.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Measure not found' }, { status: 404 });
    }

    await prisma.measure.delete({
      where: { id: params.measureId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete measure error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
