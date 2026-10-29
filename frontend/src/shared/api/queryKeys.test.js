import { describe, expect, it } from 'vitest'
import {
  adminKeys,
  approvalKeys,
  assetKeys,
  authKeys,
  dashboardKeys,
  isPrivateQuery,
  notificationKeys,
  publicKeys,
  reportKeys,
  ticketKeys,
} from './queryKeys.js'

describe('query key factories', () => {
  it('provides hierarchical roots for every verified capability family', () => {
    expect([
      authKeys.me(),
      dashboardKeys.detail({}),
      ticketKeys.comments('ticket-1', {}),
      ticketKeys.events('ticket-1', {}),
      ticketKeys.attachments('ticket-1', {}),
      ticketKeys.serviceLevel('ticket-1'),
      assetKeys.detail('asset-1'),
      approvalKeys.list({}),
      notificationKeys.list({}),
      reportKeys.overview({}),
      adminKeys.accessGrants(),
      adminKeys.audit({}),
      adminKeys.health(),
    ]).toHaveLength(13)
  })

  it('sorts filters and removes raw free-text search from cache keys', () => {
    const left = ticketKeys.list({ status: 'OPEN', search: 'printer serial ABC-123' })
    const right = ticketKeys.list({ search: 'printer serial ABC-123', status: 'OPEN' })

    expect(left).toEqual(right)
    expect(JSON.stringify(left)).not.toContain('printer serial ABC-123')
  })

  it('rejects secrets and classifies private versus public cache entries', () => {
    expect(() => ticketKeys.list({ password: 'never-cache-this' })).toThrow(TypeError)
    expect(isPrivateQuery({ queryKey: ticketKeys.detail('ticket-1') })).toBe(true)
    expect(isPrivateQuery({ queryKey: publicKeys.health() })).toBe(false)
    expect(isPrivateQuery({ queryKey: ['other'], meta: { private: true } })).toBe(true)
  })
})
