import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Button from '../../shared/components/Button.jsx'
import Input from '../../shared/components/Input.jsx'
import FormError from '../../shared/feedback/FormError.jsx'
import { signInMutationOptions } from './mutations.js'

function signInError(error, retrySeconds) {
  if (error?.code === 'INVALID_CREDENTIALS') {
    return 'Email or password is incorrect.'
  }
  if (error?.status === 429) {
    return `Too many sign-in attempts. Try again${retrySeconds ? ` in ${retrySeconds} seconds` : ' later'}.`
  }
  if (error?.code === 'ORIGIN_NOT_ALLOWED') {
    return 'Sign-in is unavailable because the application origin is not configured.'
  }
  return error?.message || 'Sign-in could not be completed.'
}

export default function SignInForm({ onSuccess }) {
  const [showPassword, setShowPassword] = useState(false)
  const [retrySeconds, setRetrySeconds] = useState(0)
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm({ defaultValues: { email: '', password: '' } })
  const mutation = useMutation(
    signInMutationOptions({
      onError: (error) => {
        if (error?.status === 429 && error.retryAfterMs != null) {
          setRetrySeconds(Math.max(1, Math.ceil(error.retryAfterMs / 1000)))
        }
      },
      onSuccess,
    }),
  )

  useEffect(() => {
    if (retrySeconds <= 0) return undefined
    const timeout = window.setTimeout(
      () => setRetrySeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    )
    return () => window.clearTimeout(timeout)
  }, [retrySeconds])

  const isThrottled = retrySeconds > 0
  const formError = useMemo(
    () => (mutation.error ? signInError(mutation.error, retrySeconds) : null),
    [mutation.error, retrySeconds],
  )

  function submit(values) {
    mutation.reset()
    mutation.mutate({
      email: values.email.trim().toLowerCase(),
      password: values.password,
    })
  }

  return (
    <form
      aria-describedby={formError ? 'sign-in-form-error' : undefined}
      className="grid gap-5"
      noValidate
      onSubmit={handleSubmit(submit)}
    >
      <Input
        autoComplete="email"
        error={errors.email?.message}
        inputMode="email"
        label="Email address"
        maxLength={320}
        required
        type="email"
        {...register('email', {
          required: 'Enter your email address.',
          maxLength: { value: 320, message: 'Email cannot exceed 320 characters.' },
          pattern: {
            value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/u,
            message: 'Enter a valid email address.',
          },
        })}
      />
      <div className="grid gap-2">
        <Input
          autoComplete="current-password"
          error={errors.password?.message}
          label="Password"
          maxLength={1024}
          required
          type={showPassword ? 'text' : 'password'}
          {...register('password', {
            required: 'Enter your password.',
            maxLength: {
              value: 1024,
              message: 'Password cannot exceed 1024 characters.',
            },
          })}
        />
        <Button
          aria-pressed={showPassword}
          className="w-fit px-2 text-sm"
          onClick={() => setShowPassword((visible) => !visible)}
          variant="ghost"
        >
          {showPassword ? 'Hide password' : 'Show password'}
        </Button>
      </div>
      <FormError id="sign-in-form-error" message={formError} />
      <Button
        disabled={isThrottled}
        pending={mutation.isPending}
        pendingLabel="Signing in…"
        type="submit"
      >
        {isThrottled ? `Try again in ${retrySeconds}s` : 'Sign in'}
      </Button>
    </form>
  )
}
