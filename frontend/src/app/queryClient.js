import { QueryClient } from '@tanstack/react-query'

const NON_RETRYABLE_READ_STATUSES = new Set([401, 403, 404])

function getHttpStatus(error) {
  return error?.status ?? error?.response?.status
}

export function shouldRetryQuery(failureCount, error) {
  if (NON_RETRYABLE_READ_STATUSES.has(getHttpStatus(error))) {
    return false
  }

  return failureCount < 1
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export const queryClient = createAppQueryClient()
