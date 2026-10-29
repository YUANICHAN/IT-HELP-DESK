import { queryOptions } from '@tanstack/react-query'
import { ticketKeys } from '../../shared/api/queryKeys.js'
import { FILTER_DEFINITIONS, parseFilterParams } from '../../shared/api/queryParams.js'
import {
  getTicket,
  getTicketServiceLevel,
  listQueue,
  listTicketAttachments,
  listTicketComments,
  listTicketEvents,
  listTickets,
} from './api.js'

export function ticketListQueryOptions(filters = {}) {
  const normalized = parseFilterParams(filters, FILTER_DEFINITIONS.tickets).filters
  return queryOptions({
    queryKey: ticketKeys.list(normalized),
    queryFn: ({ signal }) => listTickets(normalized, { signal }),
    meta: { private: true },
  })
}

export function queueQueryOptions(filters = {}) {
  const normalized = parseFilterParams(filters, FILTER_DEFINITIONS.tickets).filters
  return queryOptions({
    queryKey: ticketKeys.queue(normalized),
    queryFn: ({ signal }) => listQueue(normalized, { signal }),
    meta: { private: true },
  })
}

export function ticketDetailQueryOptions(ticketId) {
  return queryOptions({
    queryKey: ticketKeys.detail(ticketId),
    queryFn: ({ signal }) => getTicket(ticketId, { signal }),
    meta: { private: true },
  })
}

function timelineOptions(ticketId, filters, keyFactory, queryFn) {
  const normalized = parseFilterParams(filters, FILTER_DEFINITIONS.timeline).filters
  return queryOptions({
    queryKey: keyFactory(ticketId, normalized),
    queryFn: ({ signal }) => queryFn(ticketId, normalized, { signal }),
    meta: { private: true },
  })
}

export function ticketCommentsQueryOptions(ticketId, filters = {}) {
  return timelineOptions(ticketId, filters, ticketKeys.comments, listTicketComments)
}

export function ticketEventsQueryOptions(ticketId, filters = {}) {
  return timelineOptions(ticketId, filters, ticketKeys.events, listTicketEvents)
}

export function ticketAttachmentsQueryOptions(ticketId, filters = {}) {
  return timelineOptions(
    ticketId,
    filters,
    ticketKeys.attachments,
    listTicketAttachments,
  )
}

export function ticketServiceLevelQueryOptions(ticketId) {
  return queryOptions({
    queryKey: ticketKeys.serviceLevel(ticketId),
    queryFn: ({ signal }) => getTicketServiceLevel(ticketId, { signal }),
    meta: { private: true },
  })
}
