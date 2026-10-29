import { queryOptions } from '@tanstack/react-query'
import { adminKeys, publicKeys } from '../../shared/api/queryKeys.js'
import { getAdminHealth, getPublicHealth } from './api.js'

export function publicHealthQueryOptions() {
  return queryOptions({
    queryKey: publicKeys.health(),
    queryFn: ({ signal }) => getPublicHealth({ signal }),
    meta: { private: false },
  })
}

export function adminHealthQueryOptions() {
  return queryOptions({
    queryKey: adminKeys.health(),
    queryFn: ({ signal }) => getAdminHealth({ signal }),
    meta: { private: true },
  })
}
