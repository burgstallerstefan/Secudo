import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const UpdateAssetValueSchema = z.object({
  value: z.number().int().min(1).max(10).optional(),
  comment: z.string().optional(),
});

async function getMembership(projectId: string, userId: string) {
  return prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; assetValueId: string } }
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

    const assetValue = await prisma.assetValue.findUnique({
      where: { id: params.assetValueId },
    });

    if (!assetValue || assetValue.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Asset value not found' }, { status: 404 });
    }

    return NextResponse.json(assetValue);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get asset value error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; assetValueId: string } }
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

    const existing = await prisma.assetValue.findUnique({
      where: { id: params.assetValueId },
    });
    if (!existing || existing.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Asset value not found' }, { status: 404 });
    }

    const body = await request.json();
    const data = UpdateAssetValueSchema.parse(body);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    let updated = await prisma.assetValue.update({
      where: { id: params.assetValueId },
      data,
    });

    if (!updated.createdByUserId) {
      updated = await prisma.assetValue.update({
        where: { id: params.assetValueId },
        data: {
          createdByUserId: userId,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Update asset value error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { projectId: string; assetValueId: string } }
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

    const existing = await prisma.assetValue.findUnique({
      where: { id: params.assetValueId },
    });
    if (!existing || existing.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Asset value not found' }, { status: 404 });
    }

    await prisma.assetValue.delete({
      where: { id: params.assetValueId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete asset value error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
