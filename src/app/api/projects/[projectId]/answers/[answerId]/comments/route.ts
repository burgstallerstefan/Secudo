import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';

const CreateAnswerCommentSchema = z.object({
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

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; answerId: string } }
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

    const answer = await prisma.answer.findUnique({
      where: { id: params.answerId },
      select: {
        id: true,
        projectId: true,
      },
    });

    if (!answer || answer.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Answer not found' }, { status: 404 });
    }

    const comments = await prisma.answerComment.findMany({
      where: {
        projectId: params.projectId,
        answerId: params.answerId,
      },
      orderBy: { createdAt: 'asc' },
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

    return NextResponse.json(comments);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Get answer comments error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; answerId: string } }
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

    const answer = await prisma.answer.findUnique({
      where: { id: params.answerId },
      select: {
        id: true,
        projectId: true,
        userId: true,
        question: {
          select: {
            text: true,
          },
        },
      },
    });

    if (!answer || answer.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Answer not found' }, { status: 404 });
    }

    const payload = await request.json();
    const parsed = CreateAnswerCommentSchema.parse(payload);

    const createdComment = await prisma.answerComment.create({
      data: {
        projectId: params.projectId,
        answerId: params.answerId,
        authorUserId: userId,
        text: parsed.text,
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

    if (answer.userId !== userId) {
      const project = await prisma.project.findUnique({
        where: { id: params.projectId },
        select: { name: true },
      });
      const actorDisplayName = getActorDisplayName(session.user?.name, session.user?.email);
      const message = `${actorDisplayName} commented on your answer for "${truncateText(answer.question.text, 80)}" in "${project?.name || 'project'}".`;

      try {
        await prisma.userNotification.create({
          data: {
            recipientUserId: answer.userId,
            actorUserId: userId,
            projectId: params.projectId,
            type: 'AssessmentAnswerComment',
            message,
            link: `/projects/${params.projectId}?tab=questions&answerId=${answer.id}&commentId=${createdComment.id}`,
          },
        });
      } catch (notificationError) {
        console.error('Create answer comment notification error:', notificationError);
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

    console.error('Create answer comment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
