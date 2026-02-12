import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
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
  dueDate: z.string().optional(),
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

    const measures = await prisma.measure.findMany({
      where: { projectId: params.projectId },
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

    if (!membership || (membership.role !== 'Editor' && membership.role !== 'Admin')) {
      return NextResponse.json(
        { error: 'Not authorized (Editor required)' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { findingId, title, description, assetType, assetId, normReference, priority, dueDate } = CreateMeasureSchema.parse(body);

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
        dueDate: dueDate ? new Date(dueDate) : undefined,
        createdByUserId: userId,
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
