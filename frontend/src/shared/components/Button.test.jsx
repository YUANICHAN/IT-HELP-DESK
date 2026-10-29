import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Button from './Button.jsx'

describe('Button', () => {
  it('prevents disabled and pending actions from being activated', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    const { rerender } = render(<Button onClick={onClick}>Save ticket</Button>)

    await user.click(screen.getByRole('button', { name: 'Save ticket' }))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Button onClick={onClick} pending pendingLabel="Saving ticket…">
        Save ticket
      </Button>,
    )

    const pendingButton = screen.getByRole('button', { name: 'Saving ticket…' })
    expect(pendingButton).toBeDisabled()
    expect(pendingButton).toHaveAttribute('aria-busy', 'true')
    await user.click(pendingButton)
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Button disabled onClick={onClick}>
        Save ticket
      </Button>,
    )
    await user.click(screen.getByRole('button', { name: 'Save ticket' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
