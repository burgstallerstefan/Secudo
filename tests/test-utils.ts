/**
 * Test setup and utilities
 */

export function createMockRequest(options: any = {}) {
  return {
    json: async () => options.body || {},
    ...options,
  };
}

export function createMockSession(overrides: any = {}) {
  return {
    user: {
      id: 'test-user-1',
      email: 'test@example.com',
      name: 'Test User',
      ...overrides.user,
    },
    ...overrides,
  };
}
