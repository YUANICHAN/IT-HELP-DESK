import { describe, expect, it, vi } from 'vitest'
import { ApiError, isVersionConflict, isWorkflowConflict } from './apiError.js'
import { conflictNoticeFor, refreshVersionConflict } from './conflicts.js'
import {
  invalidateAfterTicketMutation,
  ticketMutationInvalidationKeys,
} from './invalidation.js'
import { ticketKeys } from './queryKeys.js'

describe('conflict and invalidation conventions', () => {
  it('distinguishes stale versions from other HTTP 409 outcomes', () => {
    const stale = new ApiError({
      status: 409,
      code: 'STALE_TICKET_VERSION',
      requestId: 'req-conflict',
    })
    const workflow = new ApiError({ status: 409, code: 'INVALID_TICKET_TRANSITION' })

    expect(isVersionConflict(stale)).toBe(true)
    expect(isWorkflowConflict(stale)).toBe(false)
    expect(isVersionConflict(workflow)).toBe(false)
    expect(isWorkflowConflict(workflow)).toBe(true)
    expect(conflictNoticeFor(stale)).toMatchObject({
      title: 'A newer version is available',
      requestId: 'req-conflict',
    })
    expect(conflictNoticeFor(workflow)).toBeNull()
  })

  it('refreshes only the affected versioned resource', async () => {
    const queryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined) }
    const error = new ApiError({ status: 409, code: 'STALE_TICKET_VERSION' })

    await expect(
      refreshVersionConflict(queryClient, error, ticketKeys.detail('ticket-1')),
    ).resolves.toBe(true)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ticketKeys.detail('ticket-1'),
      exact: true,
      refetchType: 'all',
    })
  })

  it('invalidates targeted dependent families after a ticket command', async () => {
    const queryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined) }
    const keys = ticketMutationInvalidationKeys('ticket-1')

    await invalidateAfterTicketMutation(queryClient, 'ticket-1')

    expect(keys).toContainEqual(ticketKeys.detail('ticket-1'))
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(keys.length)
    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: [] }),
    )
  })
})
