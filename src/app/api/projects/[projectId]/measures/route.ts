import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

const CreateMeasureSchema = z.object({
  findingId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  assetType: z.enum(['Node', 'Edge']),
  assetId: z.string(),
  normReference: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
  status: z.enum(['Open', 'InProgress', 'Done']).default('Open'),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional().nullable(),
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

    const measures = await prisma.measure.findMany({
      where: { projectId: params.projectId },
      include: {
        finding: {
          select: {
            id: true,
            assetName: true,
            normReference: true,
            severity: true,
            questionText: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return NextResponse.json(measures);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get measures error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const body = await req.json();
    const { findingId, title, description, assetType, assetId, normReference, priority, status, assignedTo, dueDate } =
      CreateMeasureSchema.parse(body);

    const finding = await prisma.finding.findUnique({
      where: { id: findingId },
    });
    if (!finding || finding.projectId !== params.projectId) {
      return NextResponse.json(
        { error: 'Invalid finding' },
        { status: 400 }
      );
    }

    if (finding.assetType !== assetType || finding.assetId !== assetId) {
      return NextResponse.json(
        { error: 'Asset reference must match finding asset' },
        { status: 400 }
      );
    }

    let dueDateValue: Date | undefined;
    if (dueDate) {
      const parsedDueDate = new Date(dueDate);
      if (Number.isNaN(parsedDueDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid dueDate' },
          { status: 400 }
        );
      }
      dueDateValue = parsedDueDate;
    }

    const measure = await prisma.measure.create({
      data: {
        projectId: params.projectId,
        findingId,
        title,
        description,
        assetType,
        assetId,
        normReference,
        priority,
        status,
        assignedTo: assignedTo?.trim() || undefined,
        dueDate: dueDateValue,
        createdByUserId: userId,
      },
      include: {
        finding: {
          select: {
            id: true,
            assetName: true,
            normReference: true,
            severity: true,
            questionText: true,
          },
        },
      },
    });

    return NextResponse.json(measure, { status: 201 });
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
    console.error('Create measure error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
