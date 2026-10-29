import { describe, expect, it } from 'vitest'
import { ApiError } from '../shared/api/apiError.js'
import {
  createAppQueryClient,
  queryRetryDelay,
  shouldRetryQuery,
} from './queryClient.js'

describe('query defaults', () => {
  it.each([401, 403, 404])('does not retry HTTP %s reads', (status) => {
    expect(shouldRetryQuery(0, new ApiError({ status }))).toBe(false)
  })

  it.each([
    new ApiError({ code: 'NETWORK_ERROR' }),
    new ApiError({ status: 503 }),
  ])('allows only one retry for eligible temporary read failures', (error) => {
    expect(shouldRetryQuery(0, error)).toBe(true)
    expect(shouldRetryQuery(1, error)).toBe(false)
  })

  it('does not retry cancellation, throttling, conflicts, or unknown errors', () => {
    expect(shouldRetryQuery(0, new DOMException('Cancelled', 'AbortError'))).toBe(false)
    expect(shouldRetryQuery(0, new ApiError({ status: 429 }))).toBe(false)
    expect(shouldRetryQuery(0, new ApiError({ status: 409 }))).toBe(false)
    expect(shouldRetryQuery(0, new Error('unknown'))).toBe(false)
  })

  it('bounds server retry guidance', () => {
    expect(queryRetryDelay(0, new ApiError({ retryAfterMs: 9000 }))).toBe(5000)
    expect(queryRetryDelay(1, new ApiError())).toBe(1000)
  })

  it('does not retry mutations', () => {
    const client = createAppQueryClient()
    expect(client.getDefaultOptions().mutations.retry).toBe(false)
    expect(client.getDefaultOptions().queries.refetchOnWindowFocus).toBe(true)
    expect(client.getDefaultOptions().queries.refetchOnReconnect).toBe(true)
  })
})
