import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isGlobalAdmin } from '@/lib/user-role';
import { supportsProjectDeletedAt } from '@/lib/project-trash';
import {
  getConfiguredOllamaModel,
  getOllamaRuntimeStatus,
  pullOllamaModel,
} from '@/lib/llm-service';

const PullModelSchema = z.object({
  model: z.string().min(1).optional(),
});

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

    const activeProjectWhere = supportsProjectDeletedAt()
      ? { id: params.projectId, deletedAt: null }
      : { id: params.projectId };

    const project = await prisma.project.findFirst({
      where: activeProjectWhere,
      select: {
        id: true,
        members: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const membershipRole = project.members[0]?.role;
    if (!isGlobalAdmin(session.user?.role) && (!membershipRole || !['Admin', 'Editor'].includes(membershipRole))) {
      return NextResponse.json({ error: 'Not authorized (Editor required)' }, { status: 403 });
    }

    const payload = PullModelSchema.parse(await request.json().catch(() => ({})));
    const model = payload.model?.trim() || getConfiguredOllamaModel();
    const pullResult = await pullOllamaModel(model);
    const status = await getOllamaRuntimeStatus({ forceRefresh: true });

    if (!pullResult.success) {
      return NextResponse.json(
        {
          success: false,
          model,
          error: pullResult.error || 'Model pull failed',
          status,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      model,
      pullStatus: pullResult.status || 'success',
      status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Pull Ollama model error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
