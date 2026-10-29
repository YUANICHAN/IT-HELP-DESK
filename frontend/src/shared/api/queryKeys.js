const SENSITIVE_FILTER_NAMES = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'csrfToken',
  'token',
  'cookie',
  'description',
  'comment',
  'body',
  'contents',
])
const FREE_TEXT_FILTER_NAMES = new Set(['search'])

function fingerprintText(value) {
  let first = 2166136261
  let second = 2246822507
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charCodeAt(index)
    first = Math.imul(first ^ character, 16777619)
    second = Math.imul(second ^ character, 3266489917)
  }
  return `${value.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`
}

function filtersKey(filters = {}) {
  const entries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))

  for (const [name] of entries) {
    if (SENSITIVE_FILTER_NAMES.has(name) || SENSITIVE_FILTER_NAMES.has(name.toLowerCase())) {
      throw new TypeError(`${name} cannot be included in a query key.`)
    }
  }

  return Object.freeze(
    Object.fromEntries(
      entries.map(([name, value]) => [
        name,
        FREE_TEXT_FILTER_NAMES.has(name) && typeof value === 'string'
          ? fingerprintText(value)
          : value,
      ]),
    ),
  )
}

function id(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} is required for this query key.`)
  }
  return value
}

export const authKeys = Object.freeze({
  all: ['auth'],
  me: () => ['auth', 'me'],
  sessions: () => ['auth', 'sessions'],
})

export const dashboardKeys = Object.freeze({
  all: ['dashboard'],
  detail: (filters) => ['dashboard', 'detail', filtersKey(filters)],
})

export const ticketKeys = Object.freeze({
  all: ['tickets'],
  lists: () => ['tickets', 'list'],
  list: (filters) => ['tickets', 'list', filtersKey(filters)],
  queues: () => ['tickets', 'queue'],
  queue: (filters) => ['tickets', 'queue', filtersKey(filters)],
  details: () => ['tickets', 'detail'],
  detail: (ticketId) => ['tickets', 'detail', id(ticketId, 'ticketId')],
  comments: (ticketId, filters) => [
    'tickets',
    'detail',
    id(ticketId, 'ticketId'),
    'comments',
    filtersKey(filters),
  ],
  events: (ticketId, filters) => [
    'tickets',
    'detail',
    id(ticketId, 'ticketId'),
    'events',
    filtersKey(filters),
  ],
  worklogs: (ticketId, filters) => [
    'tickets',
    'detail',
    id(ticketId, 'ticketId'),
    'worklogs',
    filtersKey(filters),
  ],
  attachments: (ticketId, filters) => [
    'tickets',
    'detail',
    id(ticketId, 'ticketId'),
    'attachments',
    filtersKey(filters),
  ],
  approvals: (ticketId, filters) => [
    'tickets',
    'detail',
    id(ticketId, 'ticketId'),
    'approvals',
    filtersKey(filters),
  ],
  serviceLevel: (ticketId) => [
    'tickets',
    'detail',
    id(ticketId, 'ticketId'),
    'service-level',
  ],
})

export const assetKeys = Object.freeze({
  all: ['assets'],
  lists: () => ['assets', 'list'],
  list: (filters) => ['assets', 'list', filtersKey(filters)],
  selectable: (filters) => ['assets', 'selectable', filtersKey(filters)],
  details: () => ['assets', 'detail'],
  detail: (assetId) => ['assets', 'detail', id(assetId, 'assetId')],
  custody: (assetId, filters) => [
    'assets',
    'detail',
    id(assetId, 'assetId'),
    'custody',
    filtersKey(filters),
  ],
  events: (assetId, filters) => [
    'assets',
    'detail',
    id(assetId, 'assetId'),
    'events',
    filtersKey(filters),
  ],
  tickets: (assetId, filters) => [
    'assets',
    'detail',
    id(assetId, 'assetId'),
    'tickets',
    filtersKey(filters),
  ],
})

export const approvalKeys = Object.freeze({
  all: ['approvals'],
  lists: () => ['approvals', 'list'],
  list: (filters) => ['approvals', 'list', filtersKey(filters)],
})

export const notificationKeys = Object.freeze({
  all: ['notifications'],
  lists: () => ['notifications', 'list'],
  list: (filters) => ['notifications', 'list', filtersKey(filters)],
})

export const reportKeys = Object.freeze({
  all: ['reports'],
  overview: (filters) => ['reports', 'overview', filtersKey(filters)],
})

export const adminKeys = Object.freeze({
  all: ['admin'],
  accessGrants: () => ['admin', 'access-grants'],
  audits: () => ['admin', 'audit'],
  audit: (filters) => ['admin', 'audit', filtersKey(filters)],
  health: () => ['admin', 'health'],
})

export const publicKeys = Object.freeze({
  all: ['public'],
  health: () => ['public', 'health'],
})

export const PRIVATE_QUERY_ROOTS = Object.freeze([
  'auth',
  'dashboard',
  'tickets',
  'assets',
  'approvals',
  'notifications',
  'reports',
  'admin',
])

export function isPrivateQuery(query) {
  if (query.meta?.private === true) return true
  return PRIVATE_QUERY_ROOTS.includes(query.queryKey?.[0])
}
