import { z } from 'zod'

const ticketStatusSchema = z.enum([
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'WAITING_REQUESTER',
  'WAITING_VENDOR',
  'WAITING_APPROVAL',
  'REJECTED',
  'CANCELLED',
])

export const ticketSchema = z
  .object({
    id: z.string().min(1),
    reference: z.string().min(1),
    title: z.string(),
    status: ticketStatusSchema,
    version: z.number().int().nonnegative(),
  })
  .passthrough()

export const standardPaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

export const ticketCollectionSchema = z.object({
  tickets: z.array(ticketSchema),
  pagination: standardPaginationSchema,
})

export const attachmentSchema = z
  .object({
    id: z.string().min(1),
    filename: z.string().min(1),
    mimeType: z.string(),
    size: z.number().int().nonnegative(),
    visibility: z.string(),
    state: z.string(),
    scanStatus: z.string(),
    createdAt: z.string(),
  })
  .passthrough()

export function parseTicketCollection(value) {
  return ticketCollectionSchema.parse(value)
}

export function parseTicketEnvelope(value) {
  return z.object({ ticket: ticketSchema }).parse(value)
}

export function parseAttachmentEnvelope(value) {
  return z.object({ attachment: attachmentSchema }).parse(value)
}

export function parseAttachmentCollection(value) {
  return z
    .object({
      attachments: z.array(attachmentSchema),
      pagination: standardPaginationSchema,
    })
    .parse(value)
}

export function parseTimelineCollection(value, key) {
  return z
    .object({
      [key]: z.array(z.object({ id: z.string().min(1) }).passthrough()),
      pagination: standardPaginationSchema,
    })
    .parse(value)
}
