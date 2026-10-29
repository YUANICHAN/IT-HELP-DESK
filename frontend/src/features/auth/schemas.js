import { z } from 'zod'

export const PASSWORD_POLICY = Object.freeze({
  minimumCharacters: 12,
  maximumCharacters: 128,
  maximumBytes: 1024,
})

const instantSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected an ISO date-time string.',
})

const sessionClientSchema = z
  .object({
    browser: z.string(),
    operatingSystem: z.string(),
    deviceType: z.enum(['desktop', 'mobile', 'tablet', 'unknown']),
  })
  .passthrough()

export const sessionSchema = z
  .object({
    id: z.string().min(1),
    client: sessionClientSchema,
    createdAt: instantSchema,
    lastSeenAt: instantSchema,
    idleExpiresAt: instantSchema,
    absoluteExpiresAt: instantSchema,
    isCurrent: z.boolean(),
  })
  .passthrough()

const userSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string(),
    email: z.string(),
    role: z.enum(['EMPLOYEE', 'TECHNICIAN', 'SUPERVISOR', 'ADMINISTRATOR']),
    accountStatus: z.enum(['INVITED', 'ACTIVE', 'DISABLED']),
    mustChangePassword: z.boolean(),
  })
  .passthrough()

const permissionSchema = z
  .object({
    id: z.string(),
    capability: z.string(),
    scope: z.discriminatedUnion('type', [
      z.object({ type: z.literal('ORGANIZATION') }),
      z.object({ type: z.literal('DEPARTMENT'), departmentId: z.string().min(1) }),
    ]),
  })
  .passthrough()

export const authSessionSchema = z
  .object({
    user: userSchema,
    organization: z.object({ id: z.string(), name: z.string() }).passthrough(),
    department: z.object({ id: z.string(), name: z.string() }).passthrough(),
    permissions: z.array(permissionSchema),
    session: sessionSchema,
    csrfToken: z.string().min(1),
  })
  .passthrough()

export const sessionsEnvelopeSchema = z.object({
  sessions: z.array(sessionSchema),
})

export function parseAuthSession(value) {
  return authSessionSchema.parse(value)
}

export function parseSessionsEnvelope(value) {
  return sessionsEnvelopeSchema.parse(value)
}

export function newPasswordValidationMessage(password) {
  if (typeof password !== 'string') return 'Enter a new password.'
  const characterLength = [...password].length
  if (characterLength < PASSWORD_POLICY.minimumCharacters) {
    return `Use at least ${PASSWORD_POLICY.minimumCharacters} characters.`
  }
  if (characterLength > PASSWORD_POLICY.maximumCharacters) {
    return `Use no more than ${PASSWORD_POLICY.maximumCharacters} characters.`
  }
  if (new TextEncoder().encode(password).byteLength > PASSWORD_POLICY.maximumBytes) {
    return 'The password is too long when encoded.'
  }
  return true
}
