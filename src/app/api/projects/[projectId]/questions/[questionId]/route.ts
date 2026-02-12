import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const UpdateQuestionSchema = z.object({
  text: z.string().min(1).optional(),
  normReference: z.string().optional(),
  targetType: z.enum(['Component', 'Edge', 'DataObject', 'None']).optional(),
  answerType: z.enum(['YesNo', 'Text', 'MultiSelect']).optional(),
  riskDescription: z.string().optional(),
  defaultMeasures: z.string().optional(),
});

async function getMembership(projectId: string, userId: string) {
  return prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; questionId: string } }
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

    const question = await prisma.question.findUnique({
      where: { id: params.questionId },
      include: { answers: true },
    });

    if (!question || question.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    return NextResponse.json(question);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; questionId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getMembership(params.projectId, userId);
    if (!membership || !['Admin', 'Editor'].includes(membership.role)) {
      return NextResponse.json({ error: 'Not authorized (Editor required)' }, { status: 403 });
    }

    const existing = await prisma.question.findUnique({
      where: { id: params.questionId },
    });
    if (!existing || existing.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const payload = await request.json();
    const data = UpdateQuestionSchema.parse(payload);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const updated = await prisma.question.update({
      where: { id: params.questionId },
      data,
      include: { answers: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Update question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { projectId: string; questionId: string } }
) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await getMembership(params.projectId, userId);
    if (!membership || !['Admin', 'Editor'].includes(membership.role)) {
      return NextResponse.json({ error: 'Not authorized (Editor required)' }, { status: 403 });
    }

    const existing = await prisma.question.findUnique({
      where: { id: params.questionId },
    });
    if (!existing || existing.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    await prisma.question.delete({
      where: { id: params.questionId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete question error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
