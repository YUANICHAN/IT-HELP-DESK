import { describe, expect, it, vi } from 'vitest'
import {
  createIdempotencyManager,
  DuplicateSubmissionError,
  serializeJsonBody,
} from './idempotency.js'
import { executeIdempotentMutation } from './mutation.js'

function managerWithKeys(...keys) {
  const randomUUID = vi.fn()
  for (const key of keys) randomUUID.mockReturnValueOnce(key)
  return { manager: createIdempotencyManager({ randomUUID }), randomUUID }
}

describe('idempotent mutation convention', () => {
  it('uses stable JSON serialization for an exact request fingerprint', () => {
    expect(serializeJsonBody({ note: undefined, expectedVersion: 4, action: 'START' })).toBe(
      '{"action":"START","expectedVersion":4}',
    )
  })

  it('prevents simultaneous duplicate submission', () => {
    const { manager } = managerWithKeys('key-1')
    manager.begin('ticket:1:start', '{"expectedVersion":1}')
    expect(() => manager.begin('ticket:1:start', '{"expectedVersion":1}')).toThrow(
      DuplicateSubmissionError,
    )
  })

  it('reuses a key only for the exact request after an uncertain result', async () => {
    const { manager, randomUUID } = managerWithKeys('key-1', 'key-2')
    const sentKeys = []
    const request = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }))
      .mockResolvedValueOnce({ accepted: true })

    await expect(
      executeIdempotentMutation({
        idempotencyManager: manager,
        scope: 'ticket:1:start',
        fingerprint: '{"expectedVersion":1}',
        request: (key) => {
          sentKeys.push(key)
          return request()
        },
      }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    await executeIdempotentMutation({
      idempotencyManager: manager,
      scope: 'ticket:1:start',
      fingerprint: '{"expectedVersion":1}',
      request: (key) => {
        sentKeys.push(key)
        return request()
      },
    })

    expect(sentKeys).toEqual(['key-1', 'key-1'])
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('generates a new key when input changes after an uncertain result', async () => {
    const { manager } = managerWithKeys('key-1', 'key-2')
    manager.begin('ticket:1:start', '{"expectedVersion":1}')
    manager.finish('ticket:1:start', 'uncertain')

    expect(manager.begin('ticket:1:start', '{"expectedVersion":2}')).toEqual({
      key: 'key-2',
      reused: false,
    })
  })
})
