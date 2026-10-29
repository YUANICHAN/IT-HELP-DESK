import { describe, expect, it } from 'vitest'
import { createAppQueryClient, shouldRetryQuery } from './queryClient.js'

describe('query defaults', () => {
  it.each([401, 403, 404])('does not retry HTTP %s reads', (status) => {
    expect(shouldRetryQuery(0, { status })).toBe(false)
  })

  it('allows only one retry for other read failures', () => {
    expect(shouldRetryQuery(0, new Error('temporary'))).toBe(true)
    expect(shouldRetryQuery(1, new Error('temporary'))).toBe(false)
  })

  it('does not retry mutations', () => {
    const client = createAppQueryClient()
    expect(client.getDefaultOptions().mutations.retry).toBe(false)
  })
})
