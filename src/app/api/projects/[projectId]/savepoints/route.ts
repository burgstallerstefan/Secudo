import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';

const CreateSavepointSchema = z.object({
  title: z.string().min(1).max(120),
  snapshot: z.unknown(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const access = await getProjectViewAccess(params.projectId, userId, session.user?.role);
    if (!access.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (!access.canView) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const savepoints = await prisma.canonicalModelSavepoint.findMany({
      where: { projectId: params.projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(savepoints);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get savepoints error:', error);
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
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const access = await getProjectViewAccess(params.projectId, userId, session.user?.role);
    if (!access.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (
      !isGlobalAdmin(session.user?.role) &&
      (!access.membershipRole || (access.membershipRole !== 'Admin' && access.membershipRole !== 'Editor'))
    ) {
      return NextResponse.json({ error: 'Not authorized (Editor required)' }, { status: 403 });
    }

    const payload = await request.json();
    const data = CreateSavepointSchema.parse(payload);
    const modelJson = JSON.stringify(data.snapshot);
    if (modelJson.length > 2_000_000) {
      return NextResponse.json({ error: 'Snapshot is too large' }, { status: 413 });
    }

    const created = await prisma.canonicalModelSavepoint.create({
      data: {
        projectId: params.projectId,
        title: data.title.trim(),
        modelJson,
        createdByUserId: userId,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Create savepoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
