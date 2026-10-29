import { queryOptions } from '@tanstack/react-query'
import { authKeys } from '../../shared/api/queryKeys.js'
import { getCurrentIdentity, listSessions } from './api.js'

export function currentIdentityQueryOptions() {
  return queryOptions({
    queryKey: authKeys.me(),
    queryFn: ({ signal }) => getCurrentIdentity({ signal }),
    meta: { private: true },
    staleTime: 0,
  })
}

export function sessionsQueryOptions() {
  return queryOptions({
    queryKey: authKeys.sessions(),
    queryFn: ({ signal }) => listSessions({ signal }),
    meta: { private: true },
  })
}
