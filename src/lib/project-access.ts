import { prisma } from '@/lib/prisma';
import { isGlobalAdmin } from '@/lib/user-role';
import { supportsProjectDeletedAt } from '@/lib/project-trash';

export type ProjectMembershipRole = 'Admin' | 'Editor' | 'Viewer';
export type ProjectMinRoleToView = 'any' | 'viewer' | 'editor' | 'admin' | 'private';

const roleRank: Record<ProjectMembershipRole, number> = {
  Viewer: 1,
  Editor: 2,
  Admin: 3,
};

function normalizeMembershipRole(role: string | null | undefined): ProjectMembershipRole | null {
  if (!role) return null;

  const value = role.toLowerCase();
  if (value === 'viewer') return 'Viewer';
  if (value === 'editor') return 'Editor';
  if (value === 'admin') return 'Admin';
  return null;
}

export function canUserViewProject(
  minRoleToView: string,
  membershipRole: string | null | undefined,
  globalRole?: string | null
): boolean {
  if (isGlobalAdmin(globalRole)) {
    return true;
  }

  if (minRoleToView === 'any') {
    return true;
  }

  const normalizedRole = normalizeMembershipRole(membershipRole);
  if (!normalizedRole) {
    return false;
  }

  if (minRoleToView === 'private') {
    return true;
  }

  const requiredRole: Record<Exclude<ProjectMinRoleToView, 'any' | 'private'>, ProjectMembershipRole> = {
    viewer: 'Viewer',
    editor: 'Editor',
    admin: 'Admin',
  };

  const required = requiredRole[minRoleToView as keyof typeof requiredRole];
  if (!required) {
    return false;
  }

  return roleRank[normalizedRole] >= roleRank[required];
}

export async function getProjectViewAccess(projectId: string, userId: string, globalRole?: string | null): Promise<{
  exists: boolean;
  canView: boolean;
  minRoleToView?: string;
  membershipRole?: string | null;
}> {
  const projectWhere = supportsProjectDeletedAt()
    ? { id: projectId, deletedAt: null }
    : { id: projectId };

  const project = await prisma.project.findFirst({
    where: projectWhere,
    select: {
      minRoleToView: true,
      members: {
        where: { userId },
        select: { role: true },
      },
    },
  });

  if (!project) {
    return { exists: false, canView: false };
  }

  const membershipRole = project.members[0]?.role ?? null;
  return {
    exists: true,
    canView: canUserViewProject(project.minRoleToView, membershipRole, globalRole),
    minRoleToView: project.minRoleToView,
    membershipRole,
  };
}
