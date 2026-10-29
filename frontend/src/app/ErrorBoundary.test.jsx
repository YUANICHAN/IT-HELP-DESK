import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary.jsx'

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('replaces a failed tree and can remount it on recovery', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    let shouldThrow = true

    function RecoverableContent() {
      if (shouldThrow) throw new Error('sensitive implementation detail')
      return <p>Recovered content</p>
    }

    render(
      <ErrorBoundary>
        <RecoverableContent />
      </ErrorBoundary>,
    )

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('sensitive implementation detail'),
    ).not.toBeInTheDocument()

    shouldThrow = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByText('Recovered content')).toBeInTheDocument()
  })
})
