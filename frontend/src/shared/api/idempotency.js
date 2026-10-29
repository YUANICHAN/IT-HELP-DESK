const fileIdentities = new WeakMap()
let nextFileIdentity = 1

function normalizeJson(value, seen) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError('The request contains a value that cannot be serialized as JSON.')
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : normalizeJson(item, seen)))
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new TypeError('The request body cannot contain circular data.')
    seen.add(value)
    const normalized = {}
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) normalized[key] = normalizeJson(value[key], seen)
    }
    seen.delete(value)
    return normalized
  }
  return null
}

export function serializeJsonBody(value) {
  return JSON.stringify(normalizeJson(value, new WeakSet()))
}

function fileIdentity(file) {
  if (!fileIdentities.has(file)) {
    fileIdentities.set(file, nextFileIdentity)
    nextFileIdentity += 1
  }
  return fileIdentities.get(file)
}

export function fingerprintFormData(formData) {
  if (!(formData instanceof FormData)) {
    throw new TypeError('A FormData instance is required.')
  }

  const entries = []
  for (const [name, value] of formData.entries()) {
    if (typeof value === 'string') {
      entries.push([name, 'text', value])
    } else {
      entries.push([
        name,
        'file',
        fileIdentity(value),
        value.name,
        value.type,
        value.size,
        value.lastModified,
      ])
    }
  }
  return JSON.stringify(entries)
}

export class DuplicateSubmissionError extends Error {
  constructor() {
    super('This command is already being submitted.')
    this.name = 'DuplicateSubmissionError'
    this.code = 'DUPLICATE_SUBMISSION'
  }
}

export function createIdempotencyManager({ randomUUID = () => globalThis.crypto.randomUUID() } = {}) {
  const submissions = new Map()

  return Object.freeze({
    begin(scope, fingerprint) {
      if (typeof scope !== 'string' || !scope) throw new TypeError('A command scope is required.')
      if (typeof fingerprint !== 'string') {
        throw new TypeError('An exact serialized request fingerprint is required.')
      }

      const existing = submissions.get(scope)
      if (existing?.pending) throw new DuplicateSubmissionError()

      if (existing?.fingerprint === fingerprint) {
        existing.pending = true
        return Object.freeze({ key: existing.key, reused: true })
      }

      const submission = {
        key: randomUUID(),
        fingerprint,
        pending: true,
      }
      submissions.set(scope, submission)
      return Object.freeze({ key: submission.key, reused: false })
    },

    finish(scope, outcome = 'definitive') {
      const submission = submissions.get(scope)
      if (!submission) return
      if (outcome === 'uncertain') submission.pending = false
      else submissions.delete(scope)
    },

    abandon(scope) {
      submissions.delete(scope)
    },

    clear() {
      submissions.clear()
    },
  })
}
