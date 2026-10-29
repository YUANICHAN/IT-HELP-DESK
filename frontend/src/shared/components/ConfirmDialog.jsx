import { useRef } from 'react'
import Button from './Button.jsx'
import Dialog from './Dialog.jsx'

export default function ConfirmDialog({
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  description,
  onCancel,
  onConfirm,
  open,
  pending = false,
  pendingLabel = 'Confirming…',
  title,
  variant = 'primary',
}) {
  const cancelRef = useRef(null)

  return (
    <Dialog
      description={description}
      footer={
        <>
          <Button disabled={pending} onClick={onCancel} ref={cancelRef} variant="secondary">
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            pending={pending}
            pendingLabel={pendingLabel}
            variant={variant}
          >
            {confirmLabel}
          </Button>
        </>
      }
      initialFocusRef={cancelRef}
      isDismissable={!pending}
      onClose={onCancel}
      open={open}
      size="small"
      title={title}
    />
  )
}
