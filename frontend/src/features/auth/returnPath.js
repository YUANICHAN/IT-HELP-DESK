const AUTH_PATHS = new Set(['/sign-in', '/change-password'])

export function safeReturnPath(candidate, fallback = '/') {
  if (
    typeof candidate !== 'string' ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\')
  ) {
    return fallback
  }

  let parsed
  try {
    parsed = new URL(candidate, window.location.origin)
  } catch {
    return fallback
  }

  const normalizedPathname = parsed.pathname.replace(/\/+$/u, '') || '/'

  if (
    parsed.origin !== window.location.origin ||
    parsed.username ||
    parsed.password ||
    parsed.pathname.startsWith('/api') ||
    AUTH_PATHS.has(normalizedPathname)
  ) {
    return fallback
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
