const baseSession = Object.freeze({
  id: '507f1f77bcf86cd799439011',
  client: {
    browser: 'Google Chrome',
    operatingSystem: 'Windows',
    deviceType: 'desktop',
  },
  createdAt: '2026-10-29T08:00:00.000Z',
  lastSeenAt: '2026-10-29T10:00:00.000Z',
  idleExpiresAt: '2026-10-29T10:30:00.000Z',
  absoluteExpiresAt: '2026-11-05T08:00:00.000Z',
  isCurrent: true,
})

export function authFixture(overrides = {}) {
  const user = {
    id: '507f1f77bcf86cd799439012',
    displayName: 'Synthetic Requester',
    email: 'requester@example.test',
    role: 'EMPLOYEE',
    accountStatus: 'ACTIVE',
    mustChangePassword: false,
    ...overrides.user,
  }

  return {
    user,
    organization: {
      id: '507f1f77bcf86cd799439013',
      name: 'Synthetic Organization',
      organizationType: 'COMPANY',
      timezone: 'Asia/Manila',
      supportEmail: 'support@example.test',
    },
    department: {
      id: '507f1f77bcf86cd799439014',
      code: 'OPS',
      name: 'Operations',
      isActive: true,
    },
    permissions: [],
    session: { ...baseSession, ...overrides.session },
    csrfToken: overrides.csrfToken || 'synthetic-csrf-token',
  }
}

export function sessionsFixture() {
  return {
    sessions: [
      baseSession,
      {
        ...baseSession,
        id: '507f1f77bcf86cd799439015',
        client: {
          browser: 'Safari',
          operatingSystem: 'iOS',
          deviceType: 'mobile',
        },
        createdAt: '2026-10-28T08:00:00.000Z',
        lastSeenAt: '2026-10-29T09:00:00.000Z',
        isCurrent: false,
      },
    ],
  }
}
