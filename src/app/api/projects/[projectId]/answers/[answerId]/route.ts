import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const isValidFulfillmentAnswerValue = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.toUpperCase() === 'N/A') {
    return true;
  }
  return /^(10|[0-9])$/.test(trimmed);
};

const normalizeFulfillmentAnswerValue = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.toUpperCase() === 'N/A') {
    return 'N/A';
  }
  return String(Number.parseInt(trimmed, 10));
};

const FulfillmentAnswerValueSchema = z
  .string()
  .refine(isValidFulfillmentAnswerValue, {
    message: 'answerValue must be a number from 0 to 10 or N/A',
  })
  .transform(normalizeFulfillmentAnswerValue);

const UpdateAnswerSchema = z.object({
  answerValue: FulfillmentAnswerValueSchema.optional(),
  targetType: z.enum(['Component', 'Edge', 'DataObject', 'None']).optional(),
  targetId: z.string().optional(),
  comment: z.string().optional(),
});

const isContainerCategory = (rawCategory: string | null | undefined): boolean => {
  const value = (rawCategory || '').trim().toLowerCase();
  return value === 'container' || value === 'system';
};

async function getMembership(projectId: string, userId: string) {
  return prisma.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string; answerId: string } }
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

    const answer = await prisma.answer.findUnique({
      where: { id: params.answerId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    if (!answer || answer.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Answer not found' }, { status: 404 });
    }

    return NextResponse.json(answer);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; answerId: string } }
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

    const existing = await prisma.answer.findUnique({
      where: { id: params.answerId },
    });
    if (!existing || existing.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Answer not found' }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: 'Only the answer owner can edit this answer' }, { status: 403 });
    }

    const question = await prisma.question.findUnique({
      where: { id: existing.questionId },
      select: { projectId: true, targetType: true },
    });
    if (!question || question.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Invalid question' }, { status: 400 });
    }

    const payload = await request.json();
    const data = UpdateAnswerSchema.parse(payload);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    if (
      data.targetType &&
      ['Component', 'Edge', 'DataObject', 'None'].includes(question.targetType) &&
      data.targetType !== question.targetType
    ) {
      return NextResponse.json({ error: 'targetType must match the question target type' }, { status: 400 });
    }

    const effectiveTargetType =
      data.targetType ||
      existing.targetType ||
      (['Component', 'Edge', 'DataObject', 'None'].includes(question.targetType) ? question.targetType : 'None');
    const normalizedTargetId = data.targetId === undefined ? undefined : data.targetId.trim() || null;

    if (effectiveTargetType === 'Component' && normalizedTargetId) {
      const node = await prisma.modelNode.findUnique({
        where: { id: normalizedTargetId },
      });
      if (!node || node.projectId !== params.projectId || isContainerCategory(node.category)) {
        return NextResponse.json({ error: 'Invalid component target' }, { status: 400 });
      }
    }

    if (effectiveTargetType === 'DataObject' && normalizedTargetId) {
      const dataObject = await prisma.dataObject.findUnique({
        where: { id: normalizedTargetId },
      });
      if (!dataObject || dataObject.projectId !== params.projectId) {
        return NextResponse.json({ error: 'Invalid data object target' }, { status: 400 });
      }
    }

    if (effectiveTargetType === 'Edge' && normalizedTargetId) {
      const edge = await prisma.modelEdge.findUnique({
        where: { id: normalizedTargetId },
      });
      if (!edge || edge.projectId !== params.projectId) {
        return NextResponse.json({ error: 'Invalid interface target' }, { status: 400 });
      }
    }

    const updateData: {
      answerValue?: string;
      targetType?: 'Component' | 'Edge' | 'DataObject' | 'None';
      targetId?: string | null;
      comment?: string;
    } = {
      answerValue: data.answerValue,
      targetType: data.targetType,
      comment: data.comment,
    };
    if (normalizedTargetId !== undefined) {
      updateData.targetId = normalizedTargetId;
    }

    const updated = await prisma.answer.update({
      where: { id: params.answerId },
      data: updateData,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Update answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { projectId: string; answerId: string } }
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

    const existing = await prisma.answer.findUnique({
      where: { id: params.answerId },
    });
    if (!existing || existing.projectId !== params.projectId) {
      return NextResponse.json({ error: 'Answer not found' }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: 'Only the answer owner can delete this answer' }, { status: 403 });
    }

    await prisma.answer.delete({
      where: { id: params.answerId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Delete answer error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
