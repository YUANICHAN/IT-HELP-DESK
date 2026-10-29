import { mutationOptions } from '@tanstack/react-query'
import { changePassword, login, revokeSession } from './api.js'

export function signInMutationOptions({ onError, onSuccess } = {}) {
  return mutationOptions({
    mutationKey: ['auth', 'sign-in'],
    mutationFn: (credentials) => login(credentials),
    onError,
    onSuccess,
    retry: false,
  })
}

export function changePasswordMutationOptions({ onError, onSuccess } = {}) {
  return mutationOptions({
    mutationKey: ['auth', 'change-password'],
    mutationFn: (passwords) => changePassword(passwords),
    onError,
    onSuccess,
    retry: false,
  })
}

export function revokeSessionMutationOptions({ onError, onSuccess } = {}) {
  return mutationOptions({
    mutationKey: ['auth', 'revoke-session'],
    mutationFn: ({ sessionId }) => revokeSession(sessionId),
    onError,
    onSuccess,
    retry: false,
  })
}
