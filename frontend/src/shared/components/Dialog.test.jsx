import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Button from './Button.jsx'
import Dialog from './Dialog.jsx'
import Input from './Input.jsx'

function DialogHarness({ dismissable = true }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open assignment</Button>
      <Dialog
        description="Choose a technician for this synthetic ticket."
        footer={<Button>Assign technician</Button>}
        isDismissable={dismissable}
        onClose={() => setOpen(false)}
        open={open}
        title="Assign DF-1048"
      >
        <Input label="Technician" />
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('traps keyboard focus, closes on Escape, and restores opener focus', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)

    const opener = screen.getByRole('button', { name: 'Open assignment' })
    await user.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Assign DF-1048' })
    const closeButton = screen.getByRole('button', { name: 'Close dialog' })
    const confirmButton = screen.getByRole('button', { name: 'Assign technician' })

    expect(dialog).toHaveAccessibleDescription(
      'Choose a technician for this synthetic ticket.',
    )
    await waitFor(() => expect(closeButton).toHaveFocus())

    await user.tab({ shift: true })
    expect(confirmButton).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('ignores Escape while dismissal is unsafe', async () => {
    const user = userEvent.setup()
    render(<DialogHarness dismissable={false} />)

    await user.click(screen.getByRole('button', { name: 'Open assignment' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog', { name: 'Assign DF-1048' })).toBeInTheDocument()
  })
})
