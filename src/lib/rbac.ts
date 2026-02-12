/**
 * Role-Based Access Control (RBAC) Utilities
 */

export type ProjectRole = 'Admin' | 'Editor' | 'Viewer';

export function canEdit(role: ProjectRole | null | undefined): boolean {
  return role === 'Admin' || role === 'Editor';
}

export function canAdmin(role: ProjectRole | null | undefined): boolean {
  return role === 'Admin';
}

export function canView(role: ProjectRole | null | undefined): boolean {
  return !!role; // Any role can view
}

export function roleHierarchy(): Record<ProjectRole, number> {
  return {
    Admin: 3,
    Editor: 2,
    Viewer: 1,
  };
}

export function hasHigherOrEqualRole(userRole: ProjectRole, requiredRole: ProjectRole): boolean {
  return roleHierarchy()[userRole] >= roleHierarchy()[requiredRole];
}
