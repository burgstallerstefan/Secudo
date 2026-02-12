import { canAdmin, canEdit, canView, hasHigherOrEqualRole, type ProjectRole } from '@/lib/rbac';

describe('rbac helpers', () => {
  it('allows edit for admin and editor only', () => {
    expect(canEdit('Admin')).toBe(true);
    expect(canEdit('Editor')).toBe(true);
    expect(canEdit('Viewer')).toBe(false);
  });

  it('allows admin only for admin checks', () => {
    expect(canAdmin('Admin')).toBe(true);
    expect(canAdmin('Editor')).toBe(false);
    expect(canAdmin('Viewer')).toBe(false);
  });

  it('allows view for any project role', () => {
    expect(canView('Admin')).toBe(true);
    expect(canView('Editor')).toBe(true);
    expect(canView('Viewer')).toBe(true);
    expect(canView(null)).toBe(false);
  });

  it('compares hierarchy correctly', () => {
    const roles: ProjectRole[] = ['Admin', 'Editor', 'Viewer'];
    expect(hasHigherOrEqualRole(roles[0], roles[1])).toBe(true);
    expect(hasHigherOrEqualRole(roles[1], roles[2])).toBe(true);
    expect(hasHigherOrEqualRole(roles[2], roles[0])).toBe(false);
  });
});
