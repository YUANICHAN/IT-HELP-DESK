import { isAbortError } from './apiError.js'

export function isUncertainMutationError(error) {
  return (
    isAbortError(error) ||
    error?.code === 'NETWORK_ERROR' ||
    (Number.isInteger(error?.status) && error.status >= 500)
  )
}

export async function executeIdempotentMutation({
  idempotencyManager,
  scope,
  fingerprint,
  request,
}) {
  const submission = idempotencyManager.begin(scope, fingerprint)
  try {
    const result = await request(submission.key)
    idempotencyManager.finish(scope, 'definitive')
    return result
  } catch (error) {
    idempotencyManager.finish(
      scope,
      isUncertainMutationError(error) ? 'uncertain' : 'definitive',
    )
    throw error
  }
}
