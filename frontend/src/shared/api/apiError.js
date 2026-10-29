const DEFAULT_MESSAGES = Object.freeze({
  400: 'The request could not be processed.',
  401: 'Your session is no longer valid.',
  403: 'You do not have permission to perform this action.',
  404: 'This item is unavailable or you no longer have access.',
  409: 'The request conflicts with the current server state.',
  413: 'The request or file is too large.',
  415: 'The request format is not supported.',
  422: 'Some submitted information is not valid.',
  429: 'Too many requests were made. Try again later.',
  500: 'An unexpected server error occurred.',
  502: 'The service is temporarily unavailable.',
  503: 'The service is temporarily unavailable.',
  504: 'The service did not respond in time.',
})

const ALWAYS_GENERIC_STATUSES = new Set([401, 403, 404, 500, 502, 503, 504])

export const VERSION_CONFLICT_CODES = Object.freeze([
  'STALE_TICKET_VERSION',
  'STALE_ASSET_VERSION',
  'STALE_SLA_CLOCK',
])

export const WORKFLOW_CONFLICT_CODES = Object.freeze([
  'INVALID_TICKET_TRANSITION',
  'APPROVAL_CONFLICT',
  'ASSET_STATE_CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  'CONFLICT',
])

function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, timestamp - now)
}

function safeDetails(value) {
  if (value === null || Array.isArray(value)) return value
  if (value && typeof value === 'object') return value
  return undefined
}

export function defaultApiErrorMessage(status) {
  return DEFAULT_MESSAGES[status] || 'The request could not be completed.'
}

export class ApiError extends Error {
  constructor({
    status = null,
    code = 'API_ERROR',
    message,
    requestId = null,
    details,
    retryAfterMs = null,
    cause,
  } = {}) {
    super(message || defaultApiErrorMessage(status), { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = safeDetails(details)
    this.retryAfterMs = retryAfterMs
  }

  static fromResponse(response, payload) {
    const backendError = payload?.error
    const hasVerifiedEnvelope =
      backendError &&
      typeof backendError === 'object' &&
      typeof backendError.code === 'string'

    return new ApiError({
      status: response.status,
      code: hasVerifiedEnvelope ? backendError.code : `HTTP_${response.status}`,
      message:
        !ALWAYS_GENERIC_STATUSES.has(response.status) &&
        hasVerifiedEnvelope &&
        typeof backendError.message === 'string'
          ? backendError.message
          : defaultApiErrorMessage(response.status),
      requestId:
        (hasVerifiedEnvelope && typeof backendError.requestId === 'string'
          ? backendError.requestId
          : null) || response.headers.get('X-Request-Id'),
      details: hasVerifiedEnvelope ? backendError.details : undefined,
      retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
    })
  }

  static network(cause) {
    return new ApiError({
      code: 'NETWORK_ERROR',
      message: 'Deskflow could not reach the service. Check your connection and try again.',
      cause,
    })
  }

  static malformedResponse(requestId = null, cause) {
    return new ApiError({
      code: 'MALFORMED_RESPONSE',
      message: 'Deskflow received an invalid response from the service.',
      requestId,
      cause,
    })
  }
}

export function isApiError(error) {
  return error instanceof ApiError
}

export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR'
}

export function isVersionConflict(error) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    VERSION_CONFLICT_CODES.includes(error.code)
  )
}

export function isWorkflowConflict(error) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    WORKFLOW_CONFLICT_CODES.includes(error.code)
  )
}

export function isConflictError(error) {
  return error instanceof ApiError && error.status === 409
}

export function isRetryableReadError(error) {
  if (isAbortError(error)) return false
  if (!(error instanceof ApiError)) return false
  return error.code === 'NETWORK_ERROR' || [500, 502, 503, 504].includes(error.status)
}
