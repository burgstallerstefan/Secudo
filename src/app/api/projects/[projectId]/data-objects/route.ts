import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getProjectViewAccess } from '@/lib/project-access';

const CreateDataObjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  dataClass: z.enum([
    'Credentials',
    'PersonalData',
    'SafetyRelevant',
    'ProductionData',
    'Telemetry',
    'Logs',
    'IntellectualProperty',
    'Configuration',
    'Other',
  ]),
  confidentiality: z.number().int().min(1).max(10).default(5),
  integrity: z.number().int().min(1).max(10).default(5),
  availability: z.number().int().min(1).max(10).default(5),
  tags: z.string().optional(),
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

    const access = await getProjectViewAccess(params.projectId, userId, session.user?.role);
    if (!access.exists) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!access.canView) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const dataObjects = await prisma.dataObject.findMany({
      where: { projectId: params.projectId },
      include: {
        componentData: true,
        edgeDataFlows: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(dataObjects);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Get data objects error:', error);
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
    if (!membership || !['Admin', 'Editor'].includes(membership.role)) {
      return NextResponse.json({ error: 'Not authorized (Editor required)' }, { status: 403 });
    }

    const body = await request.json();
    const data = CreateDataObjectSchema.parse(body);

    const dataObject = await prisma.dataObject.create({
      data: {
        projectId: params.projectId,
        ...data,
      },
      include: {
        componentData: true,
        edgeDataFlows: true,
      },
    });

    return NextResponse.json(dataObject, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Create data object error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
