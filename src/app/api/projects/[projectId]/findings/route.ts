import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

const CreateFindingSchema = z.object({
  assetType: z.enum(['Node', 'Edge']),
  assetId: z.string(),
  questionText: z.string(),
  normReference: z.string(),
  severity: z.number().min(1).max(10),
  description: z.string().optional(),
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

    const findings = await prisma.finding.findMany({
      where: { projectId: params.projectId },
      include: {
        measures: true,
      },
    });

    return NextResponse.json(findings);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get findings error:', error);
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
    const { assetType, assetId, questionText, normReference, severity, description } = CreateFindingSchema.parse(body);

    // Verify asset exists in project and get display name
    let assetName = 'Unknown Asset';
    if (assetType === 'Node') {
      const node = await prisma.modelNode.findUnique({ where: { id: assetId } });
      if (!node || node.projectId !== params.projectId) {
        return NextResponse.json(
          { error: 'Invalid node asset for project' },
          { status: 400 }
        );
      }
      assetName = node.name;
    } else if (assetType === 'Edge') {
      const edge = await prisma.modelEdge.findUnique({ where: { id: assetId } });
      if (!edge || edge.projectId !== params.projectId) {
        return NextResponse.json(
          { error: 'Invalid edge asset for project' },
          { status: 400 }
        );
      }
      assetName = edge.name || `${edge.sourceNodeId} -> ${edge.targetNodeId}`;
    }

    const finding = await prisma.finding.create({
      data: {
        projectId: params.projectId,
        assetType,
        assetId,
        assetName,
        questionText,
        normReference,
        severity,
        description,
      },
      include: {
        measures: true,
      },
    });

    return NextResponse.json(finding, { status: 201 });
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
    console.error('Create finding error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
