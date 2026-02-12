import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const UpsertFinalAnswerSchema = z.object({
  questionId: z.string(),
  answerValue: z.string().min(1),
  status: z.enum(['Approved', 'Pending', 'Conflict']).default('Approved'),
  notes: z.string().optional(),
});

async function getMembership(projectId: string, userId: string) {
  return prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
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

    const finalAnswers = await prisma.finalAnswer.findMany({
      where: { projectId: params.projectId },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(finalAnswers);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get final answers error:', error);
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getMembership(params.projectId, userId);
    if (!membership || membership.role !== 'Admin') {
      return NextResponse.json({ error: 'Not authorized (Admin required)' }, { status: 403 });
    }

    const payload = await request.json();
    const data = UpsertFinalAnswerSchema.parse(payload);

    const question = await prisma.question.findUnique({
      where: { id: data.questionId },
    });
    if (!question || question.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Invalid question' }, { status: 400 });
    }

    const finalAnswer = await prisma.finalAnswer.upsert({
      where: {
        projectId_questionId: {
          projectId: params.projectId,
          questionId: data.questionId,
        },
      },
      update: {
        answerValue: data.answerValue,
        status: data.status,
        notes: data.notes,
        resolvedAt: data.status === 'Approved' ? new Date() : null,
      },
      create: {
        projectId: params.projectId,
        questionId: data.questionId,
        answerValue: data.answerValue,
        status: data.status,
        notes: data.notes,
        resolvedAt: data.status === 'Approved' ? new Date() : null,
      },
    });

    return NextResponse.json(finalAnswer, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Upsert final answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
