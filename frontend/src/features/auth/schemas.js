import { z } from 'zod'

const userSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string(),
    email: z.string(),
    role: z.string(),
    accountStatus: z.string(),
    mustChangePassword: z.boolean(),
  })
  .passthrough()

export const authSessionSchema = z
  .object({
    user: userSchema,
    organization: z.object({ id: z.string(), name: z.string() }).passthrough(),
    department: z.object({ id: z.string(), name: z.string() }).passthrough(),
    permissions: z.array(
      z
        .object({
          id: z.string(),
          capability: z.string(),
          scope: z.unknown(),
        })
        .passthrough(),
    ),
    session: z.object({ id: z.string(), isCurrent: z.boolean() }).passthrough(),
    csrfToken: z.string().min(1),
  })
  .passthrough()

export function parseAuthSession(value) {
  return authSessionSchema.parse(value)
}
