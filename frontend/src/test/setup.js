import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server.js'
import { resetAuthIntegrationForTests } from '../shared/api/authIntegration.js'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetAuthIntegrationForTests()
})

afterAll(() => server.close())
