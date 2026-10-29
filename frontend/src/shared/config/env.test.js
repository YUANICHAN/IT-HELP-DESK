import { describe, expect, it } from 'vitest'
import { parsePublicEnv } from './env.js'

describe('public environment configuration', () => {
  it('uses the verified same-origin defaults', () => {
    expect(parsePublicEnv({})).toEqual({
      apiBaseUrl: '/api/v1',
      appName: 'Deskflow',
    })
  })

  it('accepts and trims public values', () => {
    expect(
      parsePublicEnv({
        VITE_API_BASE_URL: ' /api/v1 ',
        VITE_APP_NAME: ' Deskflow ',
      }),
    ).toEqual({ apiBaseUrl: '/api/v1', appName: 'Deskflow' })
  })

  it('rejects a cross-origin API URL', () => {
    expect(() =>
      parsePublicEnv({ VITE_API_BASE_URL: 'https://api.example.test/api/v1' }),
    ).toThrow('Invalid public frontend configuration')
  })
})
