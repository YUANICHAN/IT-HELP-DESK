import { http, HttpResponse } from 'msw'
import { healthFixture } from '../fixtures/health.js'

export const handlers = [
  http.get('*/api/v1/health', () => HttpResponse.json(healthFixture)),
]
