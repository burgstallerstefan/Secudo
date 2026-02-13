import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

const CreateAssetValueSchema = z.object({
  assetType: z.enum(['Node', 'Edge']),
  assetId: z.string(),
  value: z.number().min(1).max(10),
  comment: z.string().optional(),
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

    const [assetValues, dataObjects] = await Promise.all([
      prisma.assetValue.findMany({
        where: {
          projectId: params.projectId,
          assetType: {
            in: ['Node', 'Edge'],
          },
        },
      }),
      prisma.dataObject.findMany({
        where: { projectId: params.projectId },
        select: {
          id: true,
          confidentiality: true,
          integrity: true,
          availability: true,
          updatedAt: true,
        },
      }),
    ]);

    const derivedDataObjectValues = dataObjects.map((dataObject) => ({
      id: `derived_${dataObject.id}`,
      projectId: params.projectId,
      assetType: 'DataObject' as const,
      assetId: dataObject.id,
      value: Math.max(dataObject.confidentiality, dataObject.integrity, dataObject.availability),
      comment: undefined as string | undefined,
      createdAt: dataObject.updatedAt,
      updatedAt: dataObject.updatedAt,
    }));

    return NextResponse.json([...assetValues, ...derivedDataObjectValues]);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get asset values error:', error);
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
    const { assetType, assetId, value, comment } = CreateAssetValueSchema.parse(body);

    // Verify asset exists in project
    if (assetType === 'Node') {
      const node = await prisma.modelNode.findUnique({
        where: { id: assetId },
      });
      if (!node || node.projectId !== params.projectId) {
        return NextResponse.json(
          { error: 'Invalid node' },
          { status: 400 }
        );
      }
    } else if (assetType === 'Edge') {
      const edge = await prisma.modelEdge.findUnique({
        where: { id: assetId },
      });
      if (!edge || edge.projectId !== params.projectId) {
        return NextResponse.json(
          { error: 'Invalid edge' },
          { status: 400 }
        );
      }
    }

    // Create or update asset value
    let assetValue = await prisma.assetValue.upsert({
      where: {
        projectId_assetType_assetId: {
          projectId: params.projectId,
          assetType,
          assetId,
        },
      },
      update: { value, comment },
      create: {
        projectId: params.projectId,
        assetType,
        assetId,
        value,
        comment,
        createdByUserId: userId,
      },
    });

    if (!assetValue.createdByUserId) {
      assetValue = await prisma.assetValue.update({
        where: {
          id: assetValue.id,
        },
        data: {
          createdByUserId: userId,
        },
      });
    }

    return NextResponse.json(assetValue, { status: 201 });
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
    console.error('Create asset value error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
