import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';
import { getPrimaryProjectNorm, isNoneOnlyProjectNorm, parseProjectNorms } from '@/lib/project-norm';
import { isGlobalAdmin } from '@/lib/user-role';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

const DEFAULT_QUESTIONS = [
  {
    text: 'Does the component use encrypted communication (TLS/SSL)?',
    normReference: 'IEC 62443-3-3 SR 3.1',
    targetType: 'Component',
    answerType: 'YesNo',
  },
  {
    text: 'Are all default credentials changed on deployment?',
    normReference: 'IEC 62443-3-3 SR 2.2',
    targetType: 'Component',
    answerType: 'YesNo',
  },
  {
    text: 'Is there a defined access control policy for this interface?',
    normReference: 'IEC 62443-3-3 SR 2.1',
    targetType: 'Edge',
    answerType: 'YesNo',
  },
  {
    text: 'Are security updates applied within 30 days of release?',
    normReference: 'IEC 62443-3-3 SR 7.6',
    targetType: 'Component',
    answerType: 'YesNo',
  },
  {
    text: 'Are failed login attempts detected and monitored?',
    normReference: 'IEC 62443-3-3 SR 6.2',
    targetType: 'Component',
    answerType: 'YesNo',
  },
  {
    text: 'Is remote maintenance access secured with MFA?',
    normReference: 'IEC 62443-3-3 SR 1.13',
    targetType: 'Component',
    answerType: 'YesNo',
  },
] as const;

const CreateQuestionSchema = z.object({
  text: z.string().min(1),
  normReference: z.string().optional(),
  targetType: z.enum(['Component', 'Edge', 'DataObject', 'None']).default('None'),
  answerType: z.enum(['YesNo', 'Text', 'MultiSelect']).default('YesNo'),
  riskDescription: z.string().optional(),
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

    let questions = await prisma.question.findMany({
      where: { projectId: params.projectId },
      include: {
        answers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            comments: {
              orderBy: {
                createdAt: 'asc',
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
            },
          },
        },
      },
    });

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { norm: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const projectNorms = parseProjectNorms(project.norm);
    const noneOnlyNorm = isNoneOnlyProjectNorm(project.norm);
    const primaryProjectNorm = getPrimaryProjectNorm(project.norm);
    const hasIec62443 = projectNorms.includes('IEC 62443');

    if (questions.length === 0 && !noneOnlyNorm) {
      await prisma.question.createMany({
        data: DEFAULT_QUESTIONS.map((question) => ({
          projectId: params.projectId,
          text: question.text,
          normReference: hasIec62443 ? question.normReference : primaryProjectNorm,
          targetType: question.targetType,
          answerType: question.answerType,
        })),
      });

      questions = await prisma.question.findMany({
        where: { projectId: params.projectId },
        include: {
          answers: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              comments: {
                orderBy: {
                  createdAt: 'asc',
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
              },
            },
          },
        },
      });
    }

    return NextResponse.json(questions);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get questions error:', error);
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
      include: {
        project: {
          select: {
            norm: true,
          },
        },
      },
    });

    if (!isGlobalAdmin(session.user?.role) && (!membership || (membership.role !== 'Editor' && membership.role !== 'Admin'))) {
      return NextResponse.json(
        { error: 'Not authorized (Editor required)' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { text, normReference, targetType, answerType, riskDescription } = CreateQuestionSchema.parse(body);

    const projectNorm = membership?.project.norm
      ? membership.project.norm
      : (
          await prisma.project.findUnique({
            where: { id: params.projectId },
            select: { norm: true },
          })
        )?.norm;

    if (!projectNorm) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const question = await prisma.question.create({
      data: {
        projectId: params.projectId,
        text,
        normReference: normReference || (isNoneOnlyProjectNorm(projectNorm) ? 'Custom' : getPrimaryProjectNorm(projectNorm)),
        targetType,
        answerType,
        riskDescription,
      },
      include: {
        answers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            comments: {
              orderBy: {
                createdAt: 'asc',
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
            },
          },
        },
      },
    });

    return NextResponse.json(question, { status: 201 });
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
    console.error('Create question error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
