import { prisma } from '@/lib/prisma';
import { isGlobalAdmin } from '@/lib/user-role';
import { supportsProjectDeletedAt } from '@/lib/project-trash';

export type ProjectMembershipRole = 'Admin' | 'Editor' | 'Viewer';
export type ProjectMinRoleToView = 'any' | 'user' | 'admin' | 'private' | 'viewer' | 'editor';

const roleRank: Record<ProjectMembershipRole, number> = {
  Viewer: 1,
  Editor: 2,
  Admin: 3,
};

export function normalizeProjectMembershipRole(role: string | null | undefined): ProjectMembershipRole | null {
  if (!role) return null;

  const value = role.toLowerCase();
  if (value === 'viewer') return 'Viewer';
  if (value === 'editor') return 'Editor';
  if (value === 'user') return 'Editor';
  if (value === 'admin') return 'Admin';
  return null;
}

export function canEditProjectMembershipRole(role: string | null | undefined): boolean {
  const normalizedRole = normalizeProjectMembershipRole(role);
  return normalizedRole === 'Admin' || normalizedRole === 'Editor';
}

export function isProjectAdminMembershipRole(role: string | null | undefined): boolean {
  return normalizeProjectMembershipRole(role) === 'Admin';
}

export function normalizeProjectMinRoleToView(value: string | null | undefined): Exclude<ProjectMinRoleToView, 'user'> {
  const normalized = (value || '').toLowerCase();
  if (normalized === 'any') return 'any';
  if (normalized === 'admin') return 'admin';
  if (normalized === 'private') return 'private';
  if (normalized === 'viewer') return 'viewer';
  if (normalized === 'editor') return 'editor';
  if (normalized === 'user') return 'editor';
  return 'editor';
}

export function canUserViewProject(
  minRoleToView: string,
  membershipRole: string | null | undefined,
  globalRole?: string | null
): boolean {
  if (isGlobalAdmin(globalRole)) {
    return true;
  }

  const normalizedMinRoleToView = normalizeProjectMinRoleToView(minRoleToView);
  if (normalizedMinRoleToView === 'any') {
    return true;
  }

  const normalizedRole = normalizeProjectMembershipRole(membershipRole);
  if (!normalizedRole) {
    return false;
  }

  if (normalizedMinRoleToView === 'private') {
    return true;
  }

  const requiredRole: Record<Exclude<ProjectMinRoleToView, 'any' | 'private' | 'user'>, ProjectMembershipRole> = {
    viewer: 'Viewer',
    editor: 'Editor',
    admin: 'Admin',
  };

  const required = requiredRole[normalizedMinRoleToView as keyof typeof requiredRole];
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
  normalizedMembershipRole?: ProjectMembershipRole | null;
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
  const normalizedMembershipRole = normalizeProjectMembershipRole(membershipRole);
  return {
    exists: true,
    canView: canUserViewProject(project.minRoleToView, membershipRole, globalRole),
    minRoleToView: project.minRoleToView,
    membershipRole,
    normalizedMembershipRole,
  };
}
