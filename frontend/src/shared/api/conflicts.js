import { isVersionConflict } from './apiError.js'

export function conflictNoticeFor(error) {
  if (!isVersionConflict(error)) return null
  return Object.freeze({
    title: 'A newer version is available',
    message:
      'This record changed after you opened it. Review the latest server version before submitting again.',
    requestId: error.requestId,
  })
}

export async function refreshVersionConflict(queryClient, error, queryKey) {
  if (!isVersionConflict(error)) return false
  await queryClient.invalidateQueries({
    queryKey,
    exact: true,
    refetchType: 'all',
  })
  return true
}
