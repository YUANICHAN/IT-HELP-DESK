const planned = (id, path, title, step) =>
  Object.freeze({
    id,
    path,
    title,
    step,
    registered: false,
    authorization: 'deferred',
  })

export const routeMeta = Object.freeze({
  foundation: Object.freeze({
    id: 'foundation',
    path: '/',
    title: 'Project foundation',
    registered: true,
    kind: 'public-foundation-placeholder',
    authorization: 'not-implemented',
  }),
  componentPreview: Object.freeze({
    id: 'component-preview',
    path: '/dev/components',
    title: 'Component gallery',
    registered: import.meta.env.DEV,
    kind: 'development-only-preview',
    authorization: 'development-only',
  }),
  notFound: Object.freeze({
    id: 'not-found',
    path: '*',
    title: 'Page not found',
    registered: true,
    kind: 'public-fallback',
    authorization: 'not-applicable',
  }),
})

// These entries reserve stable browser locations only. They are deliberately
// unregistered until their owning feature and authorization step is complete.
export const plannedRouteMeta = Object.freeze([
  planned('sign-in', '/sign-in', 'Sign in', 5),
  planned('change-password', '/change-password', 'Change password', 5),
  planned('security', '/security', 'Password and sessions', 5),
  planned('dashboard', '/', 'Dashboard', 7),
  planned('tickets', '/tickets', 'My tickets', 8),
  planned('new-ticket', '/tickets/new', 'New ticket', 9),
  planned('ticket-detail', '/tickets/:ticketId', 'Ticket detail', 8),
  planned('queue', '/queue', 'Technician queue', 8),
  planned('approvals', '/approvals', 'Approvals', 11),
  planned('assets', '/assets', 'Assets', 12),
  planned('asset-detail', '/assets/:assetId', 'Asset detail', 12),
  planned('notifications', '/notifications', 'Notifications', 7),
  planned('reports', '/reports', 'Reports', 13),
  planned('access-grants', '/admin/access-grants', 'Access grants', 14),
  planned('audit', '/admin/audit', 'Audit', 14),
  planned('health', '/admin/health', 'Operational health', 14),
])
