import { httpClient } from '../../shared/api/httpClient.js'
import { serializeJsonBody } from '../../shared/api/idempotency.js'
import { parseAuthSession, parseSessionsEnvelope } from './schemas.js'

function sessionPath(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new TypeError('sessionId is required.')
  }
  return `/auth/sessions/${encodeURIComponent(sessionId)}`
}

export async function getCurrentIdentity({ signal } = {}) {
  return parseAuthSession(
    await httpClient.get('/auth/me', {
      auth: 'optional',
      signal,
    }),
  )
}

export async function login(credentials, { signal } = {}) {
  const body = {
    email: credentials.email,
    password: credentials.password,
  }
  return parseAuthSession(
    await httpClient.post('/auth/login', {
      auth: 'none',
      serializedBody: serializeJsonBody(body),
      signal,
    }),
  )
}

export async function logout({ signal } = {}) {
  return httpClient.post('/auth/logout', { signal })
}

export async function changePassword(passwords, { signal } = {}) {
  const body = {
    currentPassword: passwords.currentPassword,
    newPassword: passwords.newPassword,
  }
  return parseAuthSession(
    await httpClient.post('/auth/change-password', {
      serializedBody: serializeJsonBody(body),
      signal,
    }),
  )
}

export async function listSessions({ signal } = {}) {
  return parseSessionsEnvelope(
    await httpClient.get('/auth/sessions', { signal }),
  )
}

export async function revokeSession(sessionId, { signal } = {}) {
  return httpClient.delete(sessionPath(sessionId), { signal })
}
