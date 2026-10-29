import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/server.js'
import {
  replaceCsrfToken,
  resetAuthIntegrationForTests,
} from '../../shared/api/authIntegration.js'
import { createIdempotencyManager } from '../../shared/api/idempotency.js'
import { listTickets } from './api.js'
import { claimTicket } from './mutations.js'

const ticket = Object.freeze({
  id: 'ticket-1',
  reference: 'INC-2026-0042',
  title: 'Printer unavailable on level three',
  status: 'OPEN',
  version: 4,
})

afterEach(() => resetAuthIntegrationForTests())

describe('ticket feature API boundary', () => {
  it('sends only normalized allowlisted collection parameters', async () => {
    server.use(
      http.get('*/api/v1/tickets', ({ request }) => {
        const url = new URL(request.url)
        expect(Object.fromEntries(url.searchParams)).toEqual({
          status: 'OPEN',
          page: '2',
          limit: '25',
          sort: '-updatedAt',
        })
        return HttpResponse.json({
          data: {
            tickets: [ticket],
            pagination: { page: 2, limit: 25, total: 26, totalPages: 2 },
          },
        })
      }),
    )

    await expect(
      listTickets({ status: 'open', page: 2, limit: 25, sort: '-updatedAt' }),
    ).resolves.toMatchObject({ tickets: [ticket], pagination: { total: 26 } })
    await expect(listTickets({ databaseOperator: '$where' })).rejects.toBeInstanceOf(
      TypeError,
    )
  })

  it('submits the exact versioned command with CSRF and an in-memory idempotency key', async () => {
    replaceCsrfToken('csrf-claim')
    server.use(
      http.post('*/api/v1/tickets/ticket-1/claim', async ({ request }) => {
        expect(request.headers.get('X-CSRF-Token')).toBe('csrf-claim')
        expect(request.headers.get('Idempotency-Key')).toBe('claim-key-0001')
        expect(await request.json()).toEqual({ expectedVersion: 4 })
        return HttpResponse.json({ data: { ticket: { ...ticket, version: 5 } } })
      }),
    )
    const idempotencyManager = createIdempotencyManager({
      randomUUID: vi.fn(() => 'claim-key-0001'),
    })

    await expect(
      claimTicket({ ticketId: 'ticket-1', expectedVersion: 4, idempotencyManager }),
    ).resolves.toMatchObject({ ticket: { id: 'ticket-1', version: 5 } })
  })
})
