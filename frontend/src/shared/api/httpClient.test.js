import { afterEach, describe, expect, it, vi } from 'vitest'
import { delay, http, HttpResponse } from 'msw'
import { server } from '../../test/server.js'
import {
  replaceCsrfToken,
  resetAuthIntegrationForTests,
  subscribeToSessionExpiry,
} from './authIntegration.js'
import { ApiError } from './apiError.js'
import { createHttpClient } from './httpClient.js'

const baseUrl = 'http://deskflow.test/api/v1'
const client = createHttpClient({ baseUrl })

afterEach(() => resetAuthIntegrationForTests())

describe('HTTP client transport', () => {
  it('sends cookies and unwraps a verified success envelope with metadata', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init.credentials).toBe('include')
      expect(init.headers.get('Accept')).toBe('application/json')
      expect(init.headers.has('Content-Type')).toBe(false)
      return new Response(
        JSON.stringify(
          { data: { tickets: [], pagination: { total: 0 } } },
        ),
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': 'req-read-1',
            'Idempotency-Replayed': 'true',
          },
        },
      )
    })
    const credentialedClient = createHttpClient({ baseUrl, fetchImpl })

    await expect(credentialedClient.get('/tickets', { includeMeta: true })).resolves.toEqual({
      data: { tickets: [], pagination: { total: 0 } },
      meta: {
        status: 200,
        requestId: 'req-read-1',
        idempotencyReplayed: true,
      },
    })
  })

  it('adds CSRF and JSON headers only to an authenticated JSON mutation', async () => {
    replaceCsrfToken('csrf-session-value')
    server.use(
      http.post(`${baseUrl}/tickets/ticket-1/claim`, async ({ request }) => {
        expect(request.headers.get('X-CSRF-Token')).toBe('csrf-session-value')
        expect(request.headers.get('Idempotency-Key')).toBe('claim-command-0001')
        expect(request.headers.get('Content-Type')).toContain('application/json')
        expect(await request.json()).toEqual({ expectedVersion: 4 })
        return HttpResponse.json({ data: { accepted: true } })
      }),
      http.post(`${baseUrl}/auth/login`, async ({ request }) => {
        expect(request.headers.has('X-CSRF-Token')).toBe(false)
        expect(request.headers.get('Content-Type')).toContain('application/json')
        return HttpResponse.json({ data: { signedIn: true } })
      }),
    )

    await client.post('/tickets/ticket-1/claim', {
      serializedBody: '{"expectedVersion":4}',
      idempotencyKey: 'claim-command-0001',
    })
    await client.post('/auth/login', {
      auth: 'none',
      body: { email: 'requester@example.test', password: 'synthetic-password' },
    })
  })

  it('lets the browser set a multipart boundary and supports empty responses', async () => {
    replaceCsrfToken('csrf-upload')
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init.headers.has('Content-Type')).toBe(false)
      expect(init.body).toBeInstanceOf(FormData)
      expect(init.body.get('expectedVersion')).toBe('2')
      expect(init.body.get('file')).toMatchObject({ name: 'evidence.txt', size: 8 })
      return new Response(JSON.stringify({ data: { uploaded: true } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const multipartClient = createHttpClient({ baseUrl, fetchImpl })
    server.use(
      http.post(`${baseUrl}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    )

    const formData = new FormData()
    formData.set('expectedVersion', '2')
    formData.set('file', new File(['evidence'], 'evidence.txt', { type: 'text/plain' }))

    await expect(
      multipartClient.post('/tickets/ticket-1/attachments', {
        body: formData,
        headers: { 'Content-Type': 'application/json' },
      }),
    ).resolves.toEqual({ uploaded: true })
    await expect(client.post('/auth/logout')).resolves.toBeNull()
  })

  it('returns an authenticated blob with a sanitized server filename', async () => {
    server.use(
      http.get(`${baseUrl}/attachments/attachment-1/download`, ({ request }) => {
        expect(request.headers.get('Accept')).toBe('*/*')
        return new HttpResponse('report contents', {
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition':
              'attachment; filename="fallback.txt"; filename*=UTF-8\'\'..%2FDeskflow%20report.txt',
            'X-Request-Id': 'req-download-1',
          },
        })
      }),
    )

    const result = await client.get('/attachments/attachment-1/download', {
      responseType: 'blob',
    })

    expect(await result.blob.text()).toBe('report contents')
    expect(result.filename).toBe('.._Deskflow report.txt')
    expect(result.contentType).toBe('text/plain')
    expect(result.meta.requestId).toBe('req-download-1')
  })

  it('normalizes verified, non-JSON, malformed, and network failures safely', async () => {
    server.use(
      http.get(`${baseUrl}/validation`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Title is required.',
              requestId: 'req-validation',
              details: { fields: { title: 'Required' } },
            },
          },
          { status: 422, headers: { 'Retry-After': '2' } },
        ),
      ),
      http.get(`${baseUrl}/hidden`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'TICKET_NOT_FOUND',
              message: 'A secret ticket title was not found.',
              requestId: 'req-hidden',
            },
          },
          { status: 404 },
        ),
      ),
      http.get(`${baseUrl}/html-error`, () =>
        new HttpResponse('<h1>Proxy failure</h1>', { status: 502 }),
      ),
      http.get(`${baseUrl}/malformed`, () =>
        HttpResponse.json({ tickets: [] }, { headers: { 'X-Request-Id': 'req-bad' } }),
      ),
      http.get(`${baseUrl}/offline`, () => HttpResponse.error()),
    )

    await expect(client.get('/validation')).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Title is required.',
      requestId: 'req-validation',
      details: { fields: { title: 'Required' } },
      retryAfterMs: 2000,
    })
    await expect(client.get('/hidden')).rejects.toMatchObject({
      status: 404,
      code: 'TICKET_NOT_FOUND',
      message: 'This item is unavailable or you no longer have access.',
    })
    await expect(client.get('/html-error')).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_502',
      message: 'The service is temporarily unavailable.',
    })
    await expect(client.get('/malformed')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
      requestId: 'req-bad',
    })
    await expect(client.get('/offline')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: null,
    })
  })

  it('notifies session integration only for protected 401 responses', async () => {
    const listener = vi.fn()
    subscribeToSessionExpiry(listener)
    server.use(
      http.get(`${baseUrl}/private`, () =>
        HttpResponse.json(
          { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Expired.' } },
          { status: 401 },
        ),
      ),
      http.post(`${baseUrl}/auth/login`, () =>
        HttpResponse.json(
          { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Rejected.' } },
          { status: 401 },
        ),
      ),
    )

    await expect(client.get('/private')).rejects.toBeInstanceOf(ApiError)
    await expect(client.post('/auth/login', { auth: 'none', body: {} })).rejects.toBeInstanceOf(
      ApiError,
    )
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' })
  })

  it('propagates cancellation without converting it into an API failure', async () => {
    server.use(
      http.get(`${baseUrl}/slow`, async () => {
        await delay(1000)
        return HttpResponse.json({ data: { completed: true } })
      }),
    )
    const controller = new AbortController()
    const promise = client.get('/slow', { signal: controller.signal })
    controller.abort()

    const error = await promise.catch((reason) => reason)
    expect(error.name).toBe('AbortError')
    expect(error).not.toBeInstanceOf(ApiError)
  })
})
