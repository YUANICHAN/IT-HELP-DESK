import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppRoutes } from './router.jsx'
import { renderWithProviders } from '../test/renderWithProviders.jsx'

describe('application routes', () => {
  it('renders the public foundation without implying authorization', () => {
    renderWithProviders(<AppRoutes />)

    expect(screen.getByRole('heading', { name: 'Deskflow' })).toBeInTheDocument()
    expect(
      screen.getByText(/does not perform authentication or grant access/i),
    ).toBeInTheDocument()
  })

  it('renders the not-found fallback for an unknown route', () => {
    renderWithProviders(<AppRoutes />, { route: '/not-a-real-route' })

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })
})
