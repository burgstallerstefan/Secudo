import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

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

const CreateAnswerSchema = z.object({
  questionId: z.string(),
  answerValue: FulfillmentAnswerValueSchema,
  targetType: z.enum(['Component', 'Edge', 'DataObject', 'None']).optional(),
  targetId: z.string().optional(),
  comment: z.string().optional(),
});

const isContainerCategory = (rawCategory: string | null | undefined): boolean => {
  const value = (rawCategory || '').trim().toLowerCase();
  return value === 'container' || value === 'system';
};

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

    // Check authorization
    const membership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: params.projectId, userId } },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    const answers = await prisma.answer.findMany({
      where: { projectId: params.projectId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(answers);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get answers error:', error);
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

    if (!membership || !['Admin', 'Editor'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Not authorized (Editor required)' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { questionId, answerValue, targetType, targetId, comment } = CreateAnswerSchema.parse(body);

    // Verify question exists
    const question = await prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question || question.projectId !== params.projectId) {
      return NextResponse.json(
        { error: 'Invalid question' },
        { status: 400 }
      );
    }

    if (
      targetType &&
      ['Component', 'Edge', 'DataObject', 'None'].includes(question.targetType) &&
      targetType !== question.targetType
    ) {
      return NextResponse.json(
        { error: 'targetType must match the question target type' },
        { status: 400 }
      );
    }

    const effectiveTargetType =
      targetType && ['Component', 'Edge', 'DataObject', 'None'].includes(targetType)
        ? targetType
        : question.targetType && ['Component', 'Edge', 'DataObject', 'None'].includes(question.targetType)
          ? question.targetType
          : 'None';
    const normalizedTargetId = targetId?.trim() || null;

    if (effectiveTargetType === 'Component' && normalizedTargetId) {
      const node = await prisma.modelNode.findUnique({
        where: { id: normalizedTargetId },
      });
      if (!node || node.projectId !== params.projectId || isContainerCategory(node.category)) {
        return NextResponse.json(
          { error: 'Invalid component target' },
          { status: 400 }
        );
      }
    }

    if (effectiveTargetType === 'DataObject' && normalizedTargetId) {
      const dataObject = await prisma.dataObject.findUnique({
        where: { id: normalizedTargetId },
      });
      if (!dataObject || dataObject.projectId !== params.projectId) {
        return NextResponse.json(
          { error: 'Invalid data object target' },
          { status: 400 }
        );
      }
    }

    if (effectiveTargetType === 'Edge' && normalizedTargetId) {
      const edge = await prisma.modelEdge.findUnique({
        where: { id: normalizedTargetId },
      });
      if (!edge || edge.projectId !== params.projectId) {
        return NextResponse.json(
          { error: 'Invalid interface target' },
          { status: 400 }
        );
      }
    }

    const answer = await prisma.answer.create({
      data: {
        projectId: params.projectId,
        questionId,
        userId,
        answerValue,
        targetType: effectiveTargetType,
        targetId: normalizedTargetId,
        comment,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(answer, { status: 201 });
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
    console.error('Create answer error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
