let csrfToken = null
const sessionExpiryListeners = new Set()
const protectedRequestControllers = new Set()

export function getCsrfToken() {
  return csrfToken
}

export function replaceCsrfToken(nextToken) {
  if (typeof nextToken !== 'string' || nextToken.trim().length === 0) {
    throw new TypeError('A non-empty CSRF token is required.')
  }
  csrfToken = nextToken
}

export function clearCsrfToken() {
  csrfToken = null
}

export function subscribeToSessionExpiry(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('The session-expiry listener must be a function.')
  }
  sessionExpiryListeners.add(listener)
  return () => sessionExpiryListeners.delete(listener)
}

export function notifySessionExpired(error) {
  for (const listener of sessionExpiryListeners) {
    try {
      listener(error)
    } catch {
      // Authentication integration failures must not replace the verified API error.
    }
  }
}

export function createProtectedRequestSignal(externalSignal) {
  const controller = new AbortController()
  protectedRequestControllers.add(controller)

  const forwardAbort = () => controller.abort(externalSignal.reason)
  if (externalSignal?.aborted) {
    forwardAbort()
  } else {
    externalSignal?.addEventListener('abort', forwardAbort, { once: true })
  }

  return {
    signal: controller.signal,
    release() {
      protectedRequestControllers.delete(controller)
      externalSignal?.removeEventListener('abort', forwardAbort)
    },
  }
}

export function cancelProtectedRequests(reason = 'Deskflow private requests were cancelled.') {
  const abortReason =
    reason instanceof DOMException ? reason : new DOMException(String(reason), 'AbortError')
  for (const controller of protectedRequestControllers) {
    controller.abort(abortReason)
  }
  protectedRequestControllers.clear()
}

export function resetAuthIntegrationForTests() {
  clearCsrfToken()
  cancelProtectedRequests('Test reset')
  sessionExpiryListeners.clear()
}
