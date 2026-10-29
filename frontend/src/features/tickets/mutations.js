import { conflictNoticeFor, refreshVersionConflict } from '../../shared/api/conflicts.js'
import {
  fingerprintFormData,
  serializeJsonBody,
} from '../../shared/api/idempotency.js'
import { invalidateAfterTicketMutation } from '../../shared/api/invalidation.js'
import { executeIdempotentMutation } from '../../shared/api/mutation.js'
import { ticketKeys } from '../../shared/api/queryKeys.js'
import { claimTicketRequest, uploadTicketAttachment } from './api.js'

function version(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('expectedVersion must be a non-negative integer.')
  }
  return value
}

export async function claimTicket({
  ticketId,
  expectedVersion,
  idempotencyManager,
  signal,
}) {
  const serializedBody = serializeJsonBody({ expectedVersion: version(expectedVersion) })
  return executeIdempotentMutation({
    idempotencyManager,
    scope: `ticket:${ticketId}:claim`,
    fingerprint: serializedBody,
    request: (idempotencyKey) =>
      claimTicketRequest(ticketId, {
        serializedBody,
        idempotencyKey,
        signal,
      }),
  })
}

export async function uploadTicketAttachmentCommand({
  ticketId,
  file,
  expectedVersion,
  visibility,
  commentId,
  idempotencyManager,
  signal,
}) {
  if (!(file instanceof Blob)) throw new TypeError('A file is required for upload.')
  const formData = new FormData()
  formData.append('file', file, file.name || 'attachment')
  formData.append('expectedVersion', String(version(expectedVersion)))
  if (visibility !== undefined) formData.append('visibility', visibility)
  if (commentId !== undefined) formData.append('commentId', commentId)

  return executeIdempotentMutation({
    idempotencyManager,
    scope: `ticket:${ticketId}:attachment-upload`,
    fingerprint: fingerprintFormData(formData),
    request: (idempotencyKey) =>
      uploadTicketAttachment(ticketId, {
        file,
        expectedVersion,
        visibility,
        commentId,
        idempotencyKey,
        signal,
      }),
  })
}

export async function resolveTicketConflict(queryClient, ticketId, error) {
  const refreshed = await refreshVersionConflict(
    queryClient,
    error,
    ticketKeys.detail(ticketId),
  )
  return refreshed ? conflictNoticeFor(error) : null
}

export async function invalidateClaimResult(queryClient, ticketId) {
  await invalidateAfterTicketMutation(queryClient, ticketId)
}
