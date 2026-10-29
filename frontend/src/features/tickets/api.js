import { httpClient } from '../../shared/api/httpClient.js'
import { FILTER_DEFINITIONS, apiSearchParams } from '../../shared/api/queryParams.js'
import {
  parseAttachmentCollection,
  parseAttachmentEnvelope,
  parseTicketCollection,
  parseTicketEnvelope,
  parseTimelineCollection,
} from './schemas.js'

function pathId(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} is required.`)
  }
  return encodeURIComponent(value)
}

function expectedVersion(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError('expectedVersion must be a non-negative integer.')
  }
  return value
}

export async function listTickets(filters, { signal } = {}) {
  return parseTicketCollection(
    await httpClient.get('/tickets', {
      query: apiSearchParams(filters, FILTER_DEFINITIONS.tickets),
      signal,
    }),
  )
}

export async function listQueue(filters, { signal } = {}) {
  return parseTicketCollection(
    await httpClient.get('/queue', {
      query: apiSearchParams(filters, FILTER_DEFINITIONS.tickets),
      signal,
    }),
  )
}

export async function getTicket(ticketId, { signal } = {}) {
  return parseTicketEnvelope(
    await httpClient.get(`/tickets/${pathId(ticketId, 'ticketId')}`, { signal }),
  )
}

export async function listTicketComments(ticketId, filters, { signal } = {}) {
  return parseTimelineCollection(
    await httpClient.get(`/tickets/${pathId(ticketId, 'ticketId')}/comments`, {
      query: apiSearchParams(filters, FILTER_DEFINITIONS.timeline),
      signal,
    }),
    'comments',
  )
}

export async function listTicketEvents(ticketId, filters, { signal } = {}) {
  return parseTimelineCollection(
    await httpClient.get(`/tickets/${pathId(ticketId, 'ticketId')}/events`, {
      query: apiSearchParams(filters, FILTER_DEFINITIONS.timeline),
      signal,
    }),
    'events',
  )
}

export async function listTicketAttachments(ticketId, filters, { signal } = {}) {
  return parseAttachmentCollection(
    await httpClient.get(`/tickets/${pathId(ticketId, 'ticketId')}/attachments`, {
      query: apiSearchParams(filters, FILTER_DEFINITIONS.timeline),
      signal,
    }),
  )
}

export async function getTicketServiceLevel(ticketId, { signal } = {}) {
  return httpClient.get(`/tickets/${pathId(ticketId, 'ticketId')}/service-level`, {
    signal,
  })
}

export async function getAttachment(attachmentId, { signal } = {}) {
  return parseAttachmentEnvelope(
    await httpClient.get(`/attachments/${pathId(attachmentId, 'attachmentId')}`, {
      signal,
    }),
  )
}

export async function downloadAttachment(attachmentId, { signal } = {}) {
  return httpClient.get(
    `/attachments/${pathId(attachmentId, 'attachmentId')}/download`,
    { responseType: 'blob', signal },
  )
}

export async function uploadTicketAttachment(
  ticketId,
  { file, expectedVersion: version, visibility, commentId, idempotencyKey, signal },
) {
  if (!(file instanceof Blob)) throw new TypeError('A file is required for upload.')
  const formData = new FormData()
  formData.append('file', file, file.name || 'attachment')
  formData.append('expectedVersion', String(expectedVersion(version)))
  if (visibility !== undefined) formData.append('visibility', visibility)
  if (commentId !== undefined) formData.append('commentId', commentId)

  return parseAttachmentEnvelope(
    await httpClient.post(`/tickets/${pathId(ticketId, 'ticketId')}/attachments`, {
      body: formData,
      idempotencyKey,
      signal,
    }),
  )
}

export async function claimTicketRequest(
  ticketId,
  { serializedBody, idempotencyKey, signal },
) {
  return parseTicketEnvelope(
    await httpClient.post(`/tickets/${pathId(ticketId, 'ticketId')}/claim`, {
      serializedBody,
      idempotencyKey,
      signal,
    }),
  )
}
