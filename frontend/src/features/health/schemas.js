import { z } from 'zod'

export const publicHealthSchema = z
  .object({
    status: z.enum(['ok', 'unavailable']),
    service: z.string(),
    database: z.enum(['connected', 'disconnected']),
    timestamp: z.string(),
  })
  .passthrough()

export const adminHealthSchema = z
  .object({
    status: z.string(),
    checkedAt: z.string(),
  })
  .passthrough()
