export const PAGINATION_VARIANTS = Object.freeze({
  standard: 'totalPages',
  notifications: 'pages',
  audit: 'pages',
})

function positiveInteger(value, name, { allowZero = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new TypeError(`Pagination ${name} is invalid.`)
  }
  return value
}

export function normalizePagination(
  pagination,
  { variant = 'standard', currentPageCount = 0 } = {},
) {
  const pageCountKey = PAGINATION_VARIANTS[variant]
  if (!pageCountKey || !pagination || typeof pagination !== 'object') {
    throw new TypeError('A verified pagination variant and payload are required.')
  }

  return Object.freeze({
    page: positiveInteger(pagination.page, 'page'),
    limit: positiveInteger(pagination.limit, 'limit'),
    total: positiveInteger(pagination.total, 'total', { allowZero: true }),
    pageCount: positiveInteger(pagination[pageCountKey], pageCountKey, {
      allowZero: true,
    }),
    currentPageCount: positiveInteger(currentPageCount, 'currentPageCount', {
      allowZero: true,
    }),
  })
}
