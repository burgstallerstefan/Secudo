import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { projectId: string; savepointId: string } }
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

    const savepoint = await prisma.canonicalModelSavepoint.findFirst({
      where: {
        id: params.savepointId,
        projectId: params.projectId,
      },
      select: {
        id: true,
      },
    });

    if (!savepoint) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    await prisma.canonicalModelSavepoint.delete({
      where: { id: savepoint.id },
    });

    return NextResponse.json({ success: true, id: savepoint.id });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete savepoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
