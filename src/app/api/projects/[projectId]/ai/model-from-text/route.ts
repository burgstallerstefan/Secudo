import { NextRequest, NextResponse } from 'next/server';
import { generateModelFromText } from '@/lib/llm-service';
import { getSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * POST /api/projects/[projectId]/ai/model-from-text
 * Generate a canonical model from natural language system description
 *
 * Request Body:
 *   - systemDescription: string (natural language description)
 *
 * Response:
 *   - success: boolean
 *   - nodes: Array<{id, label, type}>
 *   - edges: Array<{from, to, direction}>
 *   - error?: string (if failed)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    // Auth check
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = params.projectId;

    // Permission check: User must be Editor+ on project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: {
          where: { userId: session.user.id },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.members.length || !['Admin', 'Editor'].includes(project.members[0].role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Parse request
    const body = await request.json();
    const { systemDescription } = body;

    if (!systemDescription || typeof systemDescription !== 'string') {
      return NextResponse.json(
        { error: 'systemDescription is required and must be a string' },
        { status: 400 }
      );
    }

    if (systemDescription.trim().length < 10) {
      return NextResponse.json(
        { error: 'Description too short. Please provide at least 10 characters' },
        { status: 400 }
      );
    }

    // Generate model using LLM service
    const result = await generateModelFromText(systemDescription);

    // Return result (success or error)
    return NextResponse.json(result);
  } catch (error) {
    console.error('Model generation error:', error);
    return NextResponse.json(
      { success: false, nodes: [], edges: [], error: 'Internal server error' },
      { status: 500 }
    );
  }
}
