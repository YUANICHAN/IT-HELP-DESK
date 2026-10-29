import { QueryClient } from '@tanstack/react-query'
import { isRetryableReadError } from '../shared/api/apiError.js'

export function shouldRetryQuery(failureCount, error) {
  return failureCount < 1 && isRetryableReadError(error)
}

export function queryRetryDelay(attemptIndex, error) {
  if (error?.retryAfterMs != null) {
    return Math.min(error.retryAfterMs, 5000)
  }
  return Math.min(500 * 2 ** attemptIndex, 2000)
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export const queryClient = createAppQueryClient()
