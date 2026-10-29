import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppProviders from '../app/AppProviders.jsx'
import ErrorBoundary from '../app/ErrorBoundary.jsx'
import { createAppQueryClient } from '../app/queryClient.js'

export function renderWithProviders(
  ui,
  { route = '/', queryClient = createAppQueryClient() } = {},
) {
  const user = userEvent.setup()
  const result = render(
    <ErrorBoundary>
      <AppProviders queryClient={queryClient}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </AppProviders>
    </ErrorBoundary>,
  )

  return { ...result, queryClient, user }
}
