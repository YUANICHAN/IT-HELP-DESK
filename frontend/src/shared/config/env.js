import { z } from 'zod'

const publicEnvSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .trim()
    .default('/api/v1')
    .refine(
      (value) => /^\/api(?:\/|$)/.test(value) && !value.endsWith('/'),
      'must be a same-origin /api path without a trailing slash',
    ),
  VITE_APP_NAME: z.string().trim().min(1).max(80).default('Deskflow'),
})

export function parsePublicEnv(values) {
  const result = publicEnvSchema.safeParse(values)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')

    throw new Error(`Invalid public frontend configuration: ${details}`)
  }

  return Object.freeze({
    apiBaseUrl: result.data.VITE_API_BASE_URL,
    appName: result.data.VITE_APP_NAME,
  })
}

export const env = parsePublicEnv(import.meta.env)
