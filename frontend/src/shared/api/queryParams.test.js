import { describe, expect, it } from 'vitest'
import { normalizePagination } from './pagination.js'
import {
  FILTER_DEFINITIONS,
  apiSearchParams,
  parseFilterParams,
  updateFilterSearchParams,
} from './queryParams.js'

describe('query parameter helpers', () => {
  it('allowlists, normalizes, and reports unsupported URL state', () => {
    const parsed = parseFilterParams(
      new URLSearchParams(
        'status=open&page=3&limit=999&search=printer&sort=-updatedAt&$where=secret',
      ),
      FILTER_DEFINITIONS.tickets,
    )

    expect(parsed.filters).toEqual({
      status: 'OPEN',
      page: 3,
      limit: 25,
      search: 'printer',
      sort: '-updatedAt',
    })
    expect(parsed.searchParams.toString()).toBe(
      'status=OPEN&search=printer&page=3&limit=25&sort=-updatedAt',
    )
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        { key: '$where', reason: 'unsupported' },
        { key: 'limit', reason: 'invalid' },
      ]),
    )
  })

  it('resets server pagination when a filter changes but not when only page changes', () => {
    const current = new URLSearchParams('status=OPEN&page=7&limit=25')

    expect(
      updateFilterSearchParams(current, { status: 'RESOLVED' }, FILTER_DEFINITIONS.tickets).get(
        'page',
      ),
    ).toBe('1')
    expect(
      updateFilterSearchParams(current, { page: 8 }, FILTER_DEFINITIONS.tickets).get('page'),
    ).toBe('8')
  })

  it('rejects invalid internal API filters instead of forwarding or broadening them', () => {
    expect(() =>
      apiSearchParams(
        { page: 1, limit: 25, sort: '-submittedAt', status: 'not-a-status' },
        FILTER_DEFINITIONS.tickets,
      ),
    ).toThrow(TypeError)
  })

  it('enforces exclusive reporting ranges and the verified 366-day maximum', () => {
    const equal = parseFilterParams(
      { from: '2026-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' },
      FILTER_DEFINITIONS.reporting,
    )
    const tooLarge = parseFilterParams(
      { from: '2024-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' },
      FILTER_DEFINITIONS.reporting,
    )

    expect(equal.filters.to).toBeUndefined()
    expect(equal.issues).toContainEqual({ key: 'to', reason: 'range' })
    expect(tooLarge.filters.to).toBeUndefined()
    expect(tooLarge.issues).toContainEqual({ key: 'to', reason: 'range-too-large' })
  })

  it('keeps collection totals distinct from current-page row counts for both shapes', () => {
    expect(
      normalizePagination(
        { page: 2, limit: 25, total: 74, totalPages: 3 },
        { currentPageCount: 25 },
      ),
    ).toEqual({ page: 2, limit: 25, total: 74, pageCount: 3, currentPageCount: 25 })
    expect(
      normalizePagination(
        { page: 2, limit: 25, total: 26, pages: 2 },
        { variant: 'notifications', currentPageCount: 1 },
      ),
    ).toEqual({ page: 2, limit: 25, total: 26, pageCount: 2, currentPageCount: 1 })
  })
})
