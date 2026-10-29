import {
  cancelProtectedRequests,
  clearCsrfToken,
} from './authIntegration.js'
import { isPrivateQuery } from './queryKeys.js'

export async function clearPrivateClientState(
  queryClient,
  { clearCsrf = true } = {},
) {
  cancelProtectedRequests()
  await queryClient.cancelQueries({ predicate: isPrivateQuery })
  queryClient.removeQueries({ predicate: isPrivateQuery })
  queryClient.getMutationCache().clear()
  if (clearCsrf) clearCsrfToken()
}
