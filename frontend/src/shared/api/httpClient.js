import { env } from '../config/env.js'
import { ApiError, isAbortError } from './apiError.js'
import {
  createProtectedRequestSignal,
  getCsrfToken,
  notifySessionExpired,
} from './authIntegration.js'

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const AUTH_MODES = new Set(['none', 'optional', 'required'])
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/u

function requestMetadata(response) {
  return Object.freeze({
    status: response.status,
    requestId: response.headers.get('X-Request-Id'),
    idempotencyReplayed: response.headers.get('Idempotency-Replayed') === 'true',
  })
}

function normalizePath(path) {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('?') ||
    path.split('/').includes('..')
  ) {
    throw new TypeError('API paths must be absolute application paths without a query string.')
  }
  return path
}

function appendQuery(url, query) {
  if (!query) return url
  const search = query instanceof URLSearchParams ? query : new URLSearchParams(query)
  const serialized = search.toString()
  return serialized ? `${url}?${serialized}` : url
}

function parseJson(text) {
  if (!text.trim()) return null
  return JSON.parse(text)
}

async function readErrorPayload(response) {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function sanitizeFilename(value, fallback = 'download') {
  const cleaned = [...(value || '')]
    .map((character) => {
      const codePoint = character.codePointAt(0)
      return character === '/' ||
        character === '\\' ||
        codePoint <= 31 ||
        codePoint === 127
        ? '_'
        : character
    })
    .join('')
    .trim()
    .slice(0, 180)
  return cleaned || fallback
}

function filenameFromDisposition(disposition) {
  if (!disposition) return 'download'

  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/iu)?.[1]
  if (encoded) {
    try {
      return sanitizeFilename(decodeURIComponent(encoded))
    } catch {
      return 'download'
    }
  }

  const plain = disposition.match(/filename="([^"]+)"/iu)?.[1]
  return sanitizeFilename(plain)
}

function prepareBody({ body, serializedBody, headers }) {
  if (body !== undefined && serializedBody !== undefined) {
    throw new TypeError('Provide either body or serializedBody, not both.')
  }

  if (serializedBody !== undefined) {
    if (typeof serializedBody !== 'string') {
      throw new TypeError('serializedBody must be a JSON string.')
    }
    try {
      JSON.parse(serializedBody)
    } catch {
      throw new TypeError('serializedBody must contain valid JSON.')
    }
    headers.set('Content-Type', 'application/json')
    return serializedBody
  }

  if (body === undefined) return undefined
  if (body instanceof FormData) {
    headers.delete('Content-Type')
    return body
  }

  headers.set('Content-Type', 'application/json')
  return JSON.stringify(body)
}

async function parseResponse(response, options, auth) {
  if (!response.ok) {
    const error = ApiError.fromResponse(response, await readErrorPayload(response))
    if (response.status === 401 && auth === 'required') notifySessionExpired(error)
    throw error
  }

  const meta = requestMetadata(response)

  if (options.responseType === 'blob') {
    const blob = await response.blob()
    return Object.freeze({
      blob,
      filename: filenameFromDisposition(response.headers.get('Content-Disposition')),
      contentType: response.headers.get('Content-Type') || blob.type || 'application/octet-stream',
      meta,
    })
  }

  if (response.status === 204 || response.status === 205) {
    return options.includeMeta ? { data: null, meta } : null
  }

  let payload
  try {
    payload = parseJson(await response.text())
  } catch (error) {
    if (isAbortError(error)) throw error
    throw ApiError.malformedResponse(meta.requestId, error)
  }

  if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'data')) {
    throw ApiError.malformedResponse(meta.requestId)
  }

  return options.includeMeta ? { data: payload.data, meta } : payload.data
}

export function createHttpClient({
  baseUrl = env.apiBaseUrl,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  async function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase()
    const auth = options.auth || 'required'
    if (!AUTH_MODES.has(auth)) throw new TypeError('The request auth mode is invalid.')
    if (options.responseType && options.responseType !== 'blob') {
      throw new TypeError('The response type is invalid.')
    }
    const headers = new Headers(options.headers)
    headers.delete('Content-Type')
    headers.delete('X-CSRF-Token')
    headers.delete('Idempotency-Key')
    headers.set('Accept', options.responseType === 'blob' ? '*/*' : 'application/json')

    if (options.idempotencyKey) {
      if (!IDEMPOTENCY_KEY_PATTERN.test(options.idempotencyKey)) {
        throw new TypeError('The idempotency key does not match the API contract.')
      }
      headers.set('Idempotency-Key', options.idempotencyKey)
    }

    if (auth === 'required' && STATE_CHANGING_METHODS.has(method)) {
      const token = getCsrfToken()
      if (!token) {
        throw new ApiError({
          code: 'CSRF_TOKEN_MISSING',
          message: 'The current session is not ready for changes. Refresh and try again.',
        })
      }
      headers.set('X-CSRF-Token', token)
    }

    const body = prepareBody({
      body: options.body,
      serializedBody: options.serializedBody,
      headers,
    })
    const url = appendQuery(`${baseUrl}${normalizePath(path)}`, options.query)
    const protectedSignal =
      auth === 'required' ? createProtectedRequestSignal(options.signal) : null

    let response
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body,
        credentials: 'include',
        signal: protectedSignal?.signal || options.signal,
      })
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted || protectedSignal?.signal.aborted) {
        protectedSignal?.release()
        throw error
      }
      protectedSignal?.release()
      throw ApiError.network(error)
    }

    try {
      return await parseResponse(response, options, auth)
    } finally {
      protectedSignal?.release()
    }
  }

  return Object.freeze({
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, options) => request(path, { ...options, method: 'POST' }),
    patch: (path, options) => request(path, { ...options, method: 'PATCH' }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  })
}

export const httpClient = createHttpClient()
