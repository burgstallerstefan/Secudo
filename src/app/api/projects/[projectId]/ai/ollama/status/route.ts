import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';
import {
  getConfiguredOllamaModel,
  getOllamaRuntimeStatus,
} from '@/lib/llm-service';

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const access = await getProjectViewAccess(params.projectId, userId, session.user?.role);
    if (!access.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    if (!access.canView) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const status = await getOllamaRuntimeStatus({ forceRefresh: true });
    return NextResponse.json({
      ...status,
      configuredModel: getConfiguredOllamaModel(),
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get Ollama status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
