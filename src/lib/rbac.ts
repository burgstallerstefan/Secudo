/**
 * Role-Based Access Control (RBAC) Utilities
 */

export type ProjectRole = 'Admin' | 'User' | 'Editor' | 'Viewer';

export function canEdit(role: ProjectRole | null | undefined): boolean {
  return role === 'Admin' || role === 'User' || role === 'Editor' || role === 'Viewer';
}

export function canAdmin(role: ProjectRole | null | undefined): boolean {
  return role === 'Admin';
}

export function canView(role: ProjectRole | null | undefined): boolean {
  return !!role; // Any role can view
}

export function roleHierarchy(): Record<ProjectRole, number> {
  return {
    Admin: 2,
    User: 1,
    Editor: 1,
    Viewer: 1,
  };
}

export function hasHigherOrEqualRole(userRole: ProjectRole, requiredRole: ProjectRole): boolean {
  return roleHierarchy()[userRole] >= roleHierarchy()[requiredRole];
}
