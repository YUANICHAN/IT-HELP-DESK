const TICKET_STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'WAITING_REQUESTER',
  'WAITING_VENDOR',
  'WAITING_APPROVAL',
  'REJECTED',
  'CANCELLED',
]
const TICKET_TYPES = ['INCIDENT', 'REQUEST']
const TICKET_SORTS = [
  'submittedAt',
  '-submittedAt',
  'updatedAt',
  '-updatedAt',
  'reference',
  '-reference',
  'priority',
  '-priority',
]
const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED']
const APPROVAL_SORTS = ['requestedAt', '-requestedAt', 'decidedAt', '-decidedAt']
const ASSET_CATEGORIES = [
  'DESKTOP',
  'LAPTOP',
  'PRINTER',
  'MONITOR',
  'NETWORK',
  'UPS',
  'OTHER',
]
const ASSET_STATUSES = ['AVAILABLE', 'ASSIGNED', 'UNDER_REPAIR', 'LOST', 'RETIRED']
const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'SESSION_REVOKED',
  'PASSWORD_CHANGED',
  'AUTHENTICATION_REJECTED',
  'ACCESS_GRANT_CREATED',
  'ACCESS_GRANT_REVOKED',
]
const AUDIT_SOURCES = ['AUTHENTICATION', 'ACCESS_ADMINISTRATION']
const AUDIT_ENTITY_TYPES = ['USER', 'SESSION', 'ACCESS_GRANT', 'DEPARTMENT']
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/iu
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u

const page = Object.freeze({ type: 'integer', min: 1, max: 1_000_000 })
const limit = Object.freeze({ type: 'integer', min: 1, max: 100 })

function enumField(values, transform = (value) => value) {
  return Object.freeze({ type: 'enum', values: Object.freeze([...values]), transform })
}

function stringField(min, max) {
  return Object.freeze({ type: 'string', min, max })
}

const date = Object.freeze({ type: 'date' })
const rfc3339 = Object.freeze({ type: 'rfc3339' })
const isoTimestamp = Object.freeze({ type: 'isoTimestamp' })
const objectId = Object.freeze({ type: 'objectId' })

const timelineFields = Object.freeze({ page, limit })
const ticketFields = Object.freeze({
  status: enumField(TICKET_STATUSES, (value) => value.toUpperCase()),
  type: enumField(TICKET_TYPES, (value) => value.toUpperCase()),
  from: date,
  to: date,
  search: stringField(2, 100),
  page,
  limit,
  sort: enumField(TICKET_SORTS),
})
const approvalFields = Object.freeze({
  page,
  limit,
  status: enumField(APPROVAL_STATUSES, (value) => value.toUpperCase()),
  from: isoTimestamp,
  to: isoTimestamp,
  sort: enumField(APPROVAL_SORTS),
})
const assetFields = Object.freeze({
  page,
  limit,
  search: stringField(1, 120),
  departmentId: objectId,
  category: enumField(ASSET_CATEGORIES, (value) => value.toUpperCase()),
  status: enumField(ASSET_STATUSES, (value) => value.toUpperCase()),
})

export const FILTER_DEFINITIONS = Object.freeze({
  tickets: Object.freeze({
    fields: ticketFields,
    defaults: Object.freeze({ page: 1, limit: 25, sort: '-submittedAt' }),
    range: Object.freeze({ from: 'from', to: 'to', inclusiveEnd: true }),
  }),
  timeline: Object.freeze({
    fields: timelineFields,
    defaults: Object.freeze({ page: 1, limit: 25 }),
  }),
  approvals: Object.freeze({
    fields: approvalFields,
    defaults: Object.freeze({
      page: 1,
      limit: 25,
      status: 'PENDING',
      sort: '-requestedAt',
    }),
    range: Object.freeze({ from: 'from', to: 'to', inclusiveEnd: true }),
  }),
  assets: Object.freeze({
    fields: assetFields,
    defaults: Object.freeze({ page: 1, limit: 25 }),
  }),
  selectableAssets: Object.freeze({
    fields: Object.freeze({
      ...assetFields,
      serviceItemId: objectId,
      locationId: objectId,
    }),
    defaults: Object.freeze({ page: 1, limit: 25 }),
    required: Object.freeze(['serviceItemId']),
  }),
  notifications: Object.freeze({
    fields: Object.freeze({
      page,
      limit,
      state: enumField(['all', 'read', 'unread'], (value) => value.toLowerCase()),
    }),
    defaults: Object.freeze({ page: 1, limit: 25, state: 'all' }),
  }),
  reporting: Object.freeze({
    fields: Object.freeze({ from: rfc3339, to: rfc3339, departmentId: objectId }),
    defaults: Object.freeze({}),
    range: Object.freeze({
      from: 'from',
      to: 'to',
      inclusiveEnd: false,
      maxDays: 366,
    }),
  }),
  audit: Object.freeze({
    fields: Object.freeze({
      from: rfc3339,
      to: rfc3339,
      action: enumField(AUDIT_ACTIONS, (value) => value.toUpperCase()),
      actorId: objectId,
      entityType: enumField(AUDIT_ENTITY_TYPES, (value) => value.toUpperCase()),
      source: enumField(AUDIT_SOURCES, (value) => value.toUpperCase()),
      page,
      limit,
      sort: enumField(['asc', 'desc'], (value) => value.toLowerCase()),
    }),
    defaults: Object.freeze({ page: 1, limit: 25, sort: 'desc' }),
    range: Object.freeze({
      from: 'from',
      to: 'to',
      inclusiveEnd: false,
      maxDays: 366,
    }),
  }),
})

function collectValues(source) {
  if (source instanceof URLSearchParams) {
    const result = new Map()
    for (const key of new Set(source.keys())) result.set(key, source.getAll(key))
    return result
  }

  const result = new Map()
  for (const [key, value] of Object.entries(source || {})) {
    result.set(key, Array.isArray(value) ? value : [value])
  }
  return result
}

function parseField(raw, rule) {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined
  const value = String(raw).trim()

  if (rule.type === 'integer') {
    if (!/^\d+$/u.test(value)) return undefined
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed >= rule.min && parsed <= rule.max
      ? parsed
      : undefined
  }
  if (rule.type === 'enum') {
    const transformed = rule.transform(value)
    return rule.values.includes(transformed) ? transformed : undefined
  }
  if (rule.type === 'string') {
    return value.length >= rule.min && value.length <= rule.max ? value : undefined
  }
  if (rule.type === 'objectId') {
    return OBJECT_ID_PATTERN.test(value) ? value : undefined
  }
  if (rule.type === 'rfc3339') {
    return RFC3339_PATTERN.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined
  }
  if (rule.type === 'isoTimestamp') {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value,
    ) && !Number.isNaN(Date.parse(value))
      ? value
      : undefined
  }
  if (rule.type === 'date') {
    return !Number.isNaN(Date.parse(value)) ? value : undefined
  }
  return undefined
}

function canonicalSearchParams(filters, fields) {
  const params = new URLSearchParams()
  for (const key of Object.keys(fields)) {
    const value = filters[key]
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  return params
}

export function parseFilterParams(source, definition) {
  const values = collectValues(source)
  const filters = { ...definition.defaults }
  const issues = []

  for (const key of values.keys()) {
    if (!Object.hasOwn(definition.fields, key)) issues.push({ key, reason: 'unsupported' })
  }

  for (const [key, rule] of Object.entries(definition.fields)) {
    const supplied = values.get(key)
    if (!supplied) continue
    if (supplied.length !== 1) {
      issues.push({ key, reason: 'repeated' })
      continue
    }
    const parsed = parseField(supplied[0], rule)
    if (parsed === undefined && supplied[0] !== '' && supplied[0] != null) {
      issues.push({ key, reason: 'invalid' })
      continue
    }
    if (parsed === undefined) delete filters[key]
    else filters[key] = parsed
  }

  for (const key of definition.required || []) {
    if (filters[key] === undefined) issues.push({ key, reason: 'required' })
  }

  if (definition.range && filters[definition.range.from] && filters[definition.range.to]) {
    const from = Date.parse(filters[definition.range.from])
    const to = Date.parse(filters[definition.range.to])
    const invalidOrder = definition.range.inclusiveEnd ? from > to : from >= to
    if (invalidOrder) {
      issues.push({ key: definition.range.to, reason: 'range' })
      delete filters[definition.range.to]
    } else if (
      definition.range.maxDays &&
      to - from > definition.range.maxDays * 86_400_000
    ) {
      issues.push({ key: definition.range.to, reason: 'range-too-large' })
      delete filters[definition.range.to]
    }
  }

  return Object.freeze({
    filters: Object.freeze(filters),
    searchParams: canonicalSearchParams(filters, definition.fields),
    issues: Object.freeze(issues),
  })
}

export function updateFilterSearchParams(source, changes, definition) {
  const current = parseFilterParams(source, definition).filters
  const allowedChanges = Object.fromEntries(
    Object.entries(changes || {}).filter(([key]) => Object.hasOwn(definition.fields, key)),
  )
  const filterChanged = Object.keys(allowedChanges).some(
    (key) => key !== 'page' && allowedChanges[key] !== current[key],
  )
  const next = { ...current, ...allowedChanges }
  if (filterChanged && Object.hasOwn(definition.fields, 'page')) next.page = 1
  return parseFilterParams(next, definition).searchParams
}

export function apiSearchParams(filters, definition) {
  const parsed = parseFilterParams(filters, definition)
  if (parsed.issues.length > 0) {
    throw new TypeError('The API request contains unsupported or invalid query parameters.')
  }
  return parsed.searchParams
}
