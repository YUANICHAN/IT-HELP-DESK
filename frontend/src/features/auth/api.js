import { httpClient } from '../../shared/api/httpClient.js'
import { serializeJsonBody } from '../../shared/api/idempotency.js'
import { parseAuthSession } from './schemas.js'

export async function getCurrentIdentity({ signal } = {}) {
  return parseAuthSession(
    await httpClient.get('/auth/me', {
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
