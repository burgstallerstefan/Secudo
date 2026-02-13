export type GlobalUserRole = 'Admin' | 'User';

export function normalizeGlobalRole(role: string | null | undefined): GlobalUserRole {
  const value = (role || '').toLowerCase();
  if (value === 'admin') return 'Admin';
  return 'User';
}

export function isGlobalAdmin(role: string | null | undefined): boolean {
  return normalizeGlobalRole(role) === 'Admin';
}

export function canManageUserRoles(role: string | null | undefined): boolean {
  return normalizeGlobalRole(role) === 'Admin';
}
