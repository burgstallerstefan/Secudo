export type GlobalUserRole = 'Admin' | 'Editor' | 'Viewer';

export function normalizeGlobalRole(role: string | null | undefined): GlobalUserRole {
  const value = (role || '').toLowerCase();
  if (value === 'admin') return 'Admin';
  if (value === 'editor') return 'Editor';
  return 'Viewer';
}

export function isGlobalAdmin(role: string | null | undefined): boolean {
  return normalizeGlobalRole(role) === 'Admin';
}

export function canManageUserRoles(role: string | null | undefined): boolean {
  const normalized = normalizeGlobalRole(role);
  return normalized === 'Admin' || normalized === 'Editor';
}

