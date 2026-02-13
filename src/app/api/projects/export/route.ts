import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { isGlobalAdmin } from '@/lib/user-role';
import { supportsProjectDeletedAt } from '@/lib/project-trash';

const ExportProjectsSchema = z.object({
  projectIds: z.array(z.string().min(1)).min(1),
});

type ExportedUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  role: string;
};

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;
    const globalRole = session.user?.role;

    if (!userId) {
      return NextResponse.json({ error: 'User not found in session' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ExportProjectsSchema.parse(body);
    const uniqueProjectIds = Array.from(new Set(parsed.projectIds));
    const activeFilter = supportsProjectDeletedAt() ? { deletedAt: null } : {};

    const projects = await prisma.project.findMany({
      where: {
        id: { in: uniqueProjectIds },
        ...activeFilter,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                name: true,
                role: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (projects.length !== uniqueProjectIds.length) {
      const foundIds = new Set(projects.map((project) => project.id));
      const missingIds = uniqueProjectIds.filter((id) => !foundIds.has(id));
      return NextResponse.json(
        {
          error: 'One or more projects were not found',
          missingProjectIds: missingIds,
        },
        { status: 404 }
      );
    }

    if (!isGlobalAdmin(globalRole)) {
      const unauthorized = projects
        .filter((project) => {
          const membership = project.members.find((member) => member.userId === userId);
          return membership?.role !== 'Admin' && membership?.role !== 'Editor';
        })
        .map((project) => project.id);

      if (unauthorized.length > 0) {
        return NextResponse.json(
          {
            error: 'Not authorized to export one or more selected projects (Editor required)',
            unauthorizedProjectIds: unauthorized,
          },
          { status: 403 }
        );
      }
    }

    const projectById = new Map(projects.map((project) => [project.id, project]));
    const orderedProjects = uniqueProjectIds
      .map((projectId) => projectById.get(projectId))
      .filter((project): project is NonNullable<typeof project> => Boolean(project));

    const exportedProjects = await Promise.all(
      orderedProjects.map(async (project) => {
        const [
          nodes,
          edges,
          dataObjects,
          componentData,
          edgeDataFlows,
          assetValues,
          questions,
          answers,
          finalAnswers,
          findings,
          measures,
          reports,
          savepoints,
        ] = await Promise.all([
          prisma.modelNode.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.modelEdge.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.dataObject.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.componentData.findMany({
            where: {
              node: {
                projectId: project.id,
              },
            },
            orderBy: { id: 'asc' },
          }),
          prisma.edgeDataFlow.findMany({
            where: {
              edge: {
                projectId: project.id,
              },
            },
            orderBy: { id: 'asc' },
          }),
          prisma.assetValue.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.question.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.answer.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.finalAnswer.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.finding.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.measure.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.report.findMany({
            where: { projectId: project.id },
            orderBy: { generatedAt: 'asc' },
          }),
          prisma.canonicalModelSavepoint.findMany({
            where: { projectId: project.id },
            orderBy: { createdAt: 'asc' },
          }),
        ]);

        const referencedUserIds = new Set<string>();
        project.members.forEach((member) => {
          referencedUserIds.add(member.userId);
        });
        nodes.forEach((node) => {
          if (node.createdByUserId) referencedUserIds.add(node.createdByUserId);
          if (node.updatedByUserId) referencedUserIds.add(node.updatedByUserId);
        });
        edges.forEach((edge) => {
          if (edge.createdByUserId) referencedUserIds.add(edge.createdByUserId);
        });
        answers.forEach((answer) => {
          referencedUserIds.add(answer.userId);
        });
        measures.forEach((measure) => {
          if (measure.createdByUserId) referencedUserIds.add(measure.createdByUserId);
        });
        savepoints.forEach((savepoint) => {
          if (savepoint.createdByUserId) referencedUserIds.add(savepoint.createdByUserId);
        });

        const exportedUsers: ExportedUser[] =
          referencedUserIds.size > 0
            ? await prisma.user.findMany({
                where: {
                  id: {
                    in: Array.from(referencedUserIds),
                  },
                },
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  name: true,
                  role: true,
                },
              })
            : [];

        return {
          project: {
            id: project.id,
            name: project.name,
            description: project.description,
            norm: project.norm,
            minRoleToView: project.minRoleToView,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          },
          members: project.members.map((member) => ({
            id: member.id,
            projectId: member.projectId,
            userId: member.userId,
            role: member.role,
            createdAt: member.createdAt,
            addedAt: member.addedAt,
          })),
          users: exportedUsers,
          nodes,
          edges,
          dataObjects,
          componentData,
          edgeDataFlows,
          assetValues,
          questions,
          answers,
          finalAnswers,
          findings,
          measures,
          reports,
          savepoints,
        };
      })
    );

    return NextResponse.json({
      format: 'secudo-project-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: {
        id: session.user?.id ?? null,
        email: session.user?.email ?? null,
        name: session.user?.name ?? null,
        role: session.user?.role ?? null,
      },
      projects: exportedProjects,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Export projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
