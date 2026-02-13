import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { canEditProjectMembershipRole, canUserViewProject } from '@/lib/project-access';
import { PROJECT_NORMS, normalizeSelectableProjectNorms, serializeProjectNorms } from '@/lib/project-norm';
import { EVERYONE_GROUP_ID, isEveryoneGroupId } from '@/lib/system-groups';
import { isGlobalAdmin } from '@/lib/user-role';
import { purgeExpiredDeletedProjects, supportsProjectDeletedAt } from '@/lib/project-trash';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

const InviteRoleSchema = z
  .enum(['Admin', 'Editor', 'Viewer', 'User'])
  .transform((role) => {
    if (role === 'User') {
      return 'Editor';
    }
    return role;
  });
type InviteRole = 'Viewer' | 'Editor' | 'Admin';

const inviteRolePriority: Record<InviteRole, number> = {
  Viewer: 1,
  Editor: 2,
  Admin: 3,
};

const getHigherInviteRole = (left: InviteRole, right: InviteRole): InviteRole =>
  inviteRolePriority[right] > inviteRolePriority[left] ? right : left;
const toStoredMembershipRole = (role: InviteRole): 'Admin' | 'Editor' | 'Viewer' => role;

// Validation schemas
const CreateProjectInviteUserSchema = z.object({
  userId: z.string().trim().min(1),
  role: InviteRoleSchema.default('Viewer'),
});

const CreateProjectInviteGroupSchema = z.object({
  groupId: z.string().trim().min(1),
  role: InviteRoleSchema.default('Viewer'),
});

const CreateProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  norm: z.string().trim().optional(),
  norms: z.array(z.enum(PROJECT_NORMS)).optional(),
  invitedUsers: z.array(CreateProjectInviteUserSchema).optional().default([]),
  invitedGroups: z.array(CreateProjectInviteGroupSchema).optional().default([]),
  // Legacy fields kept for backwards compatibility.
  invitedUserIds: z.array(z.string().trim().min(1)).optional().default([]),
  invitedGroupIds: z.array(z.string().trim().min(1)).optional().default([]),
  minRoleToView: z.enum(['any', 'viewer', 'editor', 'admin', 'private', 'user']).optional(),
});

// GET /api/projects - List user's projects
export async function GET(_request: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User not found in session' },
        { status: 401 }
      );
    }

    const currentUserRole = session.user?.role;
    await purgeExpiredDeletedProjects();
    const activeFilter = supportsProjectDeletedAt() ? { deletedAt: null } : {};

    const projects = await prisma.project.findMany({
      where: isGlobalAdmin(currentUserRole)
        ? activeFilter
        : {
            ...activeFilter,
            OR: [
              { minRoleToView: 'any' },
              {
                members: {
                  some: {
                    userId,
                  },
                },
              },
            ],
          },
      include: {
        members: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const visibleProjects = projects
      .filter((project) => {
        const membership = project.members.find((member) => member.userId === userId);
        return canUserViewProject(project.minRoleToView, membership?.role, currentUserRole);
      })
      .map((project) => {
        const membership = project.members.find((member) => member.userId === userId);
        const creatorUserId = project.members[0]?.userId ?? null;
        return {
          ...project,
          canEdit: isGlobalAdmin(currentUserRole) || canEditProjectMembershipRole(membership?.role),
          canDelete:
            isGlobalAdmin(currentUserRole) ||
            membership?.role === 'Admin' ||
            creatorUserId === userId,
        };
      });
    
    if (visibleProjects.length === 0) {
      return NextResponse.json(visibleProjects);
    }

    const measureStatuses = await prisma.measure.findMany({
      where: {
        projectId: {
          in: visibleProjects.map((project) => project.id),
        },
      },
      select: {
        projectId: true,
        status: true,
      },
    });

    const progressByProjectId = new Map<string, { totalMeasures: number; completedMeasures: number }>();
    measureStatuses.forEach((measure) => {
      const current = progressByProjectId.get(measure.projectId) || {
        totalMeasures: 0,
        completedMeasures: 0,
      };
      current.totalMeasures += 1;
      if (measure.status === 'Done') {
        current.completedMeasures += 1;
      }
      progressByProjectId.set(measure.projectId, current);
    });

    const projectsWithProgress = visibleProjects.map((project) => {
      const progress = progressByProjectId.get(project.id) || {
        totalMeasures: 0,
        completedMeasures: 0,
      };
      const completionPercent =
        progress.totalMeasures > 0
          ? Math.round((progress.completedMeasures / progress.totalMeasures) * 100)
          : 0;

      return {
        ...project,
        totalMeasures: progress.totalMeasures,
        completedMeasures: progress.completedMeasures,
        completionPercent,
      };
    });

    return NextResponse.json(projectsWithProgress);
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get projects error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create new project
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const userId = session.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User not found in session' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      name,
      description,
      norm,
      norms,
      invitedUsers,
      invitedGroups,
      invitedUserIds,
      invitedGroupIds,
    } = CreateProjectSchema.parse(body);
    const normalizedDescription = description?.trim() || null;
    const normalizedNorm = serializeProjectNorms(normalizeSelectableProjectNorms(norms, norm));
    const invitedUserRoleById = new Map<string, InviteRole>();
    invitedUsers.forEach((entry) => {
      const invitedUserId = entry.userId.trim();
      if (!invitedUserId) {
        return;
      }
      const existingRole = invitedUserRoleById.get(invitedUserId);
      invitedUserRoleById.set(
        invitedUserId,
        existingRole ? getHigherInviteRole(existingRole, entry.role) : entry.role
      );
    });
    invitedUserIds.forEach((value) => {
      const invitedUserId = value.trim();
      if (!invitedUserId) {
        return;
      }
      const existingRole = invitedUserRoleById.get(invitedUserId);
      invitedUserRoleById.set(
        invitedUserId,
        existingRole ? getHigherInviteRole(existingRole, 'Viewer') : 'Viewer'
      );
    });

    const invitedGroupRoleById = new Map<string, InviteRole>();
    invitedGroups.forEach((entry) => {
      const invitedGroupId = entry.groupId.trim();
      if (!invitedGroupId) {
        return;
      }
      const existingRole = invitedGroupRoleById.get(invitedGroupId);
      invitedGroupRoleById.set(
        invitedGroupId,
        existingRole ? getHigherInviteRole(existingRole, entry.role) : entry.role
      );
    });
    invitedGroupIds.forEach((value) => {
      const invitedGroupId = value.trim();
      if (!invitedGroupId) {
        return;
      }
      const existingRole = invitedGroupRoleById.get(invitedGroupId);
      invitedGroupRoleById.set(
        invitedGroupId,
        existingRole ? getHigherInviteRole(existingRole, 'Viewer') : 'Viewer'
      );
    });

    const includeEveryoneGroup = invitedGroupRoleById.has(EVERYONE_GROUP_ID);
    const everyoneGroupInviteRole = includeEveryoneGroup
      ? invitedGroupRoleById.get(EVERYONE_GROUP_ID) ?? 'Viewer'
      : null;
    const realInvitedGroupEntries = Array.from(invitedGroupRoleById.entries()).filter(
      ([groupId]) => !isEveryoneGroupId(groupId)
    );
    const realInvitedGroupIds = realInvitedGroupEntries.map(([groupId]) => groupId);

    const project = await prisma.$transaction(async (tx) => {
      if (invitedUserRoleById.size > 0) {
        const foundUsers = await tx.user.findMany({
          where: {
            id: {
              in: Array.from(invitedUserRoleById.keys()),
            },
          },
          select: { id: true },
        });

        if (foundUsers.length !== invitedUserRoleById.size) {
          throw new Error('One or more invited users do not exist');
        }
      }

      const groupMemberships =
        realInvitedGroupIds.length > 0
          ? await tx.userGroup.findMany({
              where: {
                id: {
                  in: realInvitedGroupIds,
                },
              },
              select: {
                id: true,
                members: {
                  select: {
                    userId: true,
                  },
                },
              },
            })
          : [];

      if (groupMemberships.length !== realInvitedGroupIds.length) {
        throw new Error('One or more invited groups do not exist');
      }

      const invitedMemberRoleById = new Map<string, InviteRole>();
      invitedUserRoleById.forEach((inviteRole, invitedUserId) => {
        if (invitedUserId !== userId) {
          invitedMemberRoleById.set(invitedUserId, inviteRole);
        }
      });

      groupMemberships.forEach((group) => {
        const groupInviteRole = invitedGroupRoleById.get(group.id) ?? 'Viewer';
        group.members.forEach((member) => {
          if (member.userId !== userId) {
            const existingRole = invitedMemberRoleById.get(member.userId);
            invitedMemberRoleById.set(
              member.userId,
              existingRole ? getHigherInviteRole(existingRole, groupInviteRole) : groupInviteRole
            );
          }
        });
      });

      if (everyoneGroupInviteRole) {
        const allUsers = await tx.user.findMany({
          select: { id: true },
        });
        allUsers.forEach((candidate) => {
          if (candidate.id !== userId) {
            const existingRole = invitedMemberRoleById.get(candidate.id);
            invitedMemberRoleById.set(
              candidate.id,
              existingRole
                ? getHigherInviteRole(existingRole, everyoneGroupInviteRole)
                : everyoneGroupInviteRole
            );
          }
        });
      }

      const createdProject = await tx.project.create({
        data: {
          name,
          description: normalizedDescription,
          norm: normalizedNorm,
          minRoleToView: 'private',
        },
      });

      await tx.projectMembership.createMany({
        data: [
          {
            projectId: createdProject.id,
            userId,
            role: 'Admin',
          },
          ...Array.from(invitedMemberRoleById.entries()).map(([invitedMemberId, inviteRole]) => ({
            projectId: createdProject.id,
            userId: invitedMemberId,
            role: toStoredMembershipRole(inviteRole),
          })),
        ],
        skipDuplicates: true,
      });

      return tx.project.findUnique({
        where: { id: createdProject.id },
        include: {
          members: {
            orderBy: {
              createdAt: 'asc',
            },
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      });
    });

    if (!project) {
      throw new Error('Failed to create project');
    }

    return NextResponse.json(project, { status: 201 });
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
    if ((error as Error).message === 'One or more invited users do not exist') {
      return NextResponse.json({ error: 'One or more invited users do not exist' }, { status: 400 });
    }
    if ((error as Error).message === 'One or more invited groups do not exist') {
      return NextResponse.json({ error: 'One or more invited groups do not exist' }, { status: 400 });
    }

    console.error('Create project error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
