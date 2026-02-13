import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeProjectMembershipRole } from '@/lib/project-access';
import { isGlobalAdmin } from '@/lib/user-role';
import { EVERYONE_GROUP_ID, isEveryoneGroupId } from '@/lib/system-groups';
import { supportsProjectDeletedAt } from '@/lib/project-trash';

type InviteRole = 'Viewer' | 'Editor' | 'Admin';

const InviteRoleSchema = z.enum(['Admin', 'Editor', 'Viewer', 'User']).transform((role) => {
  if (role === 'User') {
    return 'Editor';
  }
  return role;
});

const UpdateProjectMembersInviteUserSchema = z.object({
  userId: z.string().trim().min(1),
  role: InviteRoleSchema.default('Viewer'),
});

const UpdateProjectMembersInviteGroupSchema = z.object({
  groupId: z.string().trim().min(1),
  role: InviteRoleSchema.default('Viewer'),
});

const UpdateProjectMembersSchema = z.object({
  invitedUsers: z.array(UpdateProjectMembersInviteUserSchema).optional().default([]),
  invitedGroups: z.array(UpdateProjectMembersInviteGroupSchema).optional().default([]),
  // Legacy compatibility
  invitedUserIds: z.array(z.string().trim().min(1)).optional().default([]),
  invitedGroupIds: z.array(z.string().trim().min(1)).optional().default([]),
});

const inviteRolePriority: Record<InviteRole, number> = {
  Viewer: 1,
  Editor: 2,
  Admin: 3,
};

const getHigherInviteRole = (left: InviteRole, right: InviteRole): InviteRole =>
  inviteRolePriority[right] > inviteRolePriority[left] ? right : left;

const toStoredMembershipRole = (role: InviteRole): 'Admin' | 'Editor' | 'Viewer' => role;

const normalizeInviteRoleFromMembership = (role: string | null | undefined): InviteRole =>
  normalizeProjectMembershipRole(role) ?? 'Viewer';

type ProjectMembersAccess = {
  canManageSettings: boolean;
  creatorUserId: string | null;
};

async function getProjectMembersAccess(projectId: string, userId: string, globalRole?: string | null): Promise<{
  project: {
    id: string;
    members: Array<{
      userId: string;
      role: string;
      createdAt: Date;
      user: {
        id: string;
        email: string;
        name: string | null;
        firstName: string | null;
        lastName: string | null;
      };
    }>;
  } | null;
  access: ProjectMembersAccess;
  isMember: boolean;
}> {
  const projectWhere = supportsProjectDeletedAt()
    ? { id: projectId, deletedAt: null }
    : { id: projectId };

  const project = await prisma.project.findFirst({
    where: projectWhere,
    select: {
      id: true,
      members: {
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          userId: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    return {
      project: null,
      access: {
        canManageSettings: false,
        creatorUserId: null,
      },
      isMember: false,
    };
  }

  const membership = project.members.find((member) => member.userId === userId);
  const creatorUserId = project.members[0]?.userId ?? null;
  const canManageSettings =
    isGlobalAdmin(globalRole) ||
    membership?.role === 'Admin' ||
    creatorUserId === userId;

  return {
    project,
    access: {
      canManageSettings,
      creatorUserId,
    },
    isMember: Boolean(membership),
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

    const { project, access, isMember } = await getProjectMembersAccess(
      params.projectId,
      userId,
      session.user?.role
    );

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const canReadMembers = access.canManageSettings || isMember;
    if (!canReadMembers) {
      return NextResponse.json(
        { error: 'Not authorized (Project membership required)' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      creatorUserId: access.creatorUserId,
      canManageSettings: access.canManageSettings,
      members: project.members.map((member) => ({
        userId: member.userId,
        role: normalizeProjectMembershipRole(member.role) ?? 'Viewer',
        isCreator: member.userId === access.creatorUserId,
        createdAt: member.createdAt,
        user: member.user,
      })),
    });
  } catch (error) {
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Get project members error:', error);
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

    const { project, access } = await getProjectMembersAccess(
      params.projectId,
      userId,
      session.user?.role
    );

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!access.canManageSettings) {
      return NextResponse.json(
        { error: 'Not authorized (Project creator, project Admin, or global Admin required)' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      invitedUsers,
      invitedGroups,
      invitedUserIds,
      invitedGroupIds,
    } = UpdateProjectMembersSchema.parse(body);

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

    const creatorUserId = access.creatorUserId;

    const updatedProject = await prisma.$transaction(async (tx) => {
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

      const targetMemberRoleById = new Map<string, InviteRole>();
      if (creatorUserId) {
        targetMemberRoleById.set(creatorUserId, 'Admin');
      }

      invitedUserRoleById.forEach((inviteRole, invitedUserId) => {
        if (invitedUserId === creatorUserId) {
          return;
        }
        targetMemberRoleById.set(invitedUserId, inviteRole);
      });

      groupMemberships.forEach((group) => {
        const groupInviteRole = invitedGroupRoleById.get(group.id) ?? 'Viewer';
        group.members.forEach((member) => {
          if (member.userId === creatorUserId) {
            return;
          }
          const existingRole = targetMemberRoleById.get(member.userId);
          targetMemberRoleById.set(
            member.userId,
            existingRole ? getHigherInviteRole(existingRole, groupInviteRole) : groupInviteRole
          );
        });
      });

      if (everyoneGroupInviteRole) {
        const allUsers = await tx.user.findMany({
          select: { id: true },
        });
        allUsers.forEach((candidate) => {
          if (candidate.id === creatorUserId) {
            return;
          }
          const existingRole = targetMemberRoleById.get(candidate.id);
          targetMemberRoleById.set(
            candidate.id,
            existingRole
              ? getHigherInviteRole(existingRole, everyoneGroupInviteRole)
              : everyoneGroupInviteRole
          );
        });
      }

      const actingMembership = project.members.find((member) => member.userId === userId);
      if (actingMembership && userId !== creatorUserId) {
        const currentRole = normalizeInviteRoleFromMembership(actingMembership.role);
        const existingRole = targetMemberRoleById.get(userId);
        targetMemberRoleById.set(
          userId,
          existingRole ? getHigherInviteRole(existingRole, currentRole) : currentRole
        );
      }

      const targetUserIds = Array.from(targetMemberRoleById.keys());
      await tx.projectMembership.deleteMany({
        where: {
          projectId: params.projectId,
          userId: {
            notIn: targetUserIds,
          },
        },
      });

      for (const [memberUserId, memberRole] of targetMemberRoleById.entries()) {
        await tx.projectMembership.upsert({
          where: {
            projectId_userId: {
              projectId: params.projectId,
              userId: memberUserId,
            },
          },
          update: {
            role: toStoredMembershipRole(memberRole),
          },
          create: {
            projectId: params.projectId,
            userId: memberUserId,
            role: toStoredMembershipRole(memberRole),
          },
        });
      }

      return tx.project.findFirst({
        where: { id: params.projectId },
        select: {
          id: true,
          members: {
            orderBy: {
              createdAt: 'asc',
            },
            select: {
              userId: true,
              role: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });
    });

    if (!updatedProject) {
      throw new Error('Failed to update project members');
    }

    return NextResponse.json({
      creatorUserId,
      canManageSettings: access.canManageSettings,
      members: updatedProject.members.map((member) => ({
        userId: member.userId,
        role: normalizeProjectMembershipRole(member.role) ?? 'Viewer',
        isCreator: member.userId === creatorUserId,
        createdAt: member.createdAt,
        user: member.user,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.flatten() },
        { status: 400 }
      );
    }
    if ((error as Error).message === 'Unauthenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if ((error as Error).message === 'One or more invited users do not exist') {
      return NextResponse.json({ error: 'One or more invited users do not exist' }, { status: 400 });
    }
    if ((error as Error).message === 'One or more invited groups do not exist') {
      return NextResponse.json({ error: 'One or more invited groups do not exist' }, { status: 400 });
    }

    console.error('Update project members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
