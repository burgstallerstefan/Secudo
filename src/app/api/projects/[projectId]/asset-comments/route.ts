import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';

const CreateAssetCommentSchema = z.object({
  assetType: z.enum(['Node', 'Edge', 'DataObject']),
  assetId: z.string().trim().min(1),
  text: z.string().trim().min(1).max(3000),
});

const truncateText = (value: string, maxLength: number): string => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
};

const getActorDisplayName = (name: string | null | undefined, email: string | null | undefined): string =>
  name?.trim() || email?.trim() || 'A project member';

async function resolveAssetContext(projectId: string, assetType: 'Node' | 'Edge' | 'DataObject', assetId: string) {
  let assetLabel = assetId;
  let fallbackOwnerUserId: string | null = null;

  if (assetType === 'Node') {
    const node = await prisma.modelNode.findUnique({
      where: { id: assetId },
      select: {
        projectId: true,
        name: true,
        createdByUserId: true,
      },
    });
    if (!node || node.projectId !== projectId) {
      return null;
    }
    assetLabel = node.name;
    fallbackOwnerUserId = node.createdByUserId || null;
  } else if (assetType === 'Edge') {
    const edge = await prisma.modelEdge.findUnique({
      where: { id: assetId },
      select: {
        projectId: true,
        name: true,
        createdByUserId: true,
        sourceNode: {
          select: {
            name: true,
          },
        },
        targetNode: {
          select: {
            name: true,
          },
        },
      },
    });
    if (!edge || edge.projectId !== projectId) {
      return null;
    }
    assetLabel =
      edge.name?.trim() ||
      `${edge.sourceNode?.name || 'Unknown source'} -> ${edge.targetNode?.name || 'Unknown target'}`;
    fallbackOwnerUserId = edge.createdByUserId || null;
  } else {
    const dataObject = await prisma.dataObject.findUnique({
      where: { id: assetId },
      select: {
        projectId: true,
        name: true,
      },
    });
    if (!dataObject || dataObject.projectId !== projectId) {
      return null;
    }
    assetLabel = dataObject.name;
  }

  const assetValue = await prisma.assetValue.findUnique({
    where: {
      projectId_assetType_assetId: {
        projectId,
        assetType,
        assetId,
      },
    },
    select: {
      createdByUserId: true,
    },
  });

  const ownerUserId = assetValue?.createdByUserId || fallbackOwnerUserId;
  if (ownerUserId) {
    return {
      assetLabel,
      ownerUserId,
    };
  }

  const projectCreatorMembership = await prisma.projectMembership.findFirst({
    where: {
      projectId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      userId: true,
    },
  });

  return {
    assetLabel,
    ownerUserId: projectCreatorMembership?.userId || null,
  };
}

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

    const comments = await prisma.assetValuationComment.findMany({
      where: { projectId: params.projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      take: 500,
    });

    return NextResponse.json(comments);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Get asset comments error:', error);
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

    if (!access.canView) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = CreateAssetCommentSchema.parse(payload);
    const context = await resolveAssetContext(params.projectId, parsed.assetType, parsed.assetId);

    if (!context) {
      return NextResponse.json({ error: 'Invalid asset reference' }, { status: 400 });
    }

    const createdComment = await prisma.assetValuationComment.create({
      data: {
        projectId: params.projectId,
        assetType: parsed.assetType,
        assetId: parsed.assetId,
        text: parsed.text,
        authorUserId: userId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (context.ownerUserId && context.ownerUserId !== userId) {
      const project = await prisma.project.findUnique({
        where: { id: params.projectId },
        select: { name: true },
      });
      const actorDisplayName = getActorDisplayName(session.user?.name, session.user?.email);
      const message = `${actorDisplayName} commented on your asset valuation item "${truncateText(context.assetLabel, 80)}" in "${project?.name || 'project'}".`;

      try {
        await prisma.userNotification.create({
          data: {
            recipientUserId: context.ownerUserId,
            actorUserId: userId,
            projectId: params.projectId,
            type: 'AssetValuationComment',
            message,
            link: `/projects/${params.projectId}?tab=assets&assetType=${parsed.assetType}&assetId=${parsed.assetId}&commentId=${createdComment.id}`,
          },
        });
      } catch (notificationError) {
        console.error('Create asset comment notification error:', notificationError);
      }
    }

    return NextResponse.json(createdComment, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Create asset comment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
