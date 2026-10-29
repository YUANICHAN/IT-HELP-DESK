import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Button from '../../shared/components/Button.jsx'
import Input from '../../shared/components/Input.jsx'
import FormError from '../../shared/feedback/FormError.jsx'
import { changePasswordMutationOptions } from './mutations.js'
import { newPasswordValidationMessage, PASSWORD_POLICY } from './schemas.js'

function currentPasswordMessage(value) {
  if (!value) return 'Enter your current password.'
  if (new TextEncoder().encode(value).byteLength > PASSWORD_POLICY.maximumBytes) {
    return 'The current password is too long.'
  }
  return true
}

function passwordError(error) {
  if (error?.code === 'PASSWORD_REUSE_NOT_ALLOWED') {
    return 'Choose a password that differs from your current password.'
  }
  if (error?.code === 'PASSWORD_POLICY_VIOLATION') return error.message
  return error?.message || 'The password could not be changed.'
}

export default function ChangePasswordForm({
  onAccountChanged,
  onSuccess,
  submitLabel = 'Change password',
}) {
  const {
    clearErrors,
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const mutation = useMutation(
    changePasswordMutationOptions({
      onError: (error) => {
        if (error?.code === 'CURRENT_PASSWORD_INCORRECT') {
          setError('currentPassword', {
            type: 'server',
            message: 'Current password is incorrect.',
          })
        }
        if (error?.code === 'ACCOUNT_CHANGED') onAccountChanged?.(error)
      },
      onSuccess: async (identity) => {
        reset()
        await onSuccess?.(identity)
      },
    }),
  )

  function submit(values) {
    clearErrors()
    mutation.reset()
    mutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    })
  }

  const showFormError =
    mutation.error &&
    mutation.error.code !== 'CURRENT_PASSWORD_INCORRECT' &&
    mutation.error.code !== 'ACCOUNT_CHANGED'

  return (
    <form
      aria-describedby={showFormError ? 'change-password-form-error' : undefined}
      className="grid gap-5"
      noValidate
      onSubmit={handleSubmit(submit)}
    >
      <Input
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        label="Current password"
        required
        type="password"
        {...register('currentPassword', { validate: currentPasswordMessage })}
      />
      <Input
        autoComplete="new-password"
        error={errors.newPassword?.message}
        helpText="Use 12–128 characters. Spaces and Unicode characters are allowed."
        label="New password"
        required
        type="password"
        {...register('newPassword', { validate: newPasswordValidationMessage })}
      />
      <Input
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        label="Confirm new password"
        required
        type="password"
        {...register('confirmPassword', {
          required: 'Confirm your new password.',
          validate: (value) => value === getValues('newPassword') || 'Passwords do not match.',
        })}
      />
      <FormError
        id="change-password-form-error"
        message={showFormError ? passwordError(mutation.error) : null}
      />
      <Button pending={mutation.isPending} pendingLabel="Changing password…" type="submit">
        {submitLabel}
      </Button>
    </form>
  )
}
