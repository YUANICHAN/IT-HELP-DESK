import { afterEach, describe, expect, it } from 'vitest'
import { delay, http, HttpResponse } from 'msw'
import { createAppQueryClient } from '../../app/queryClient.js'
import { server } from '../../test/server.js'
import {
  getCsrfToken,
  replaceCsrfToken,
  resetAuthIntegrationForTests,
} from './authIntegration.js'
import { clearPrivateClientState } from './cacheLifecycle.js'
import { createHttpClient } from './httpClient.js'
import { publicKeys, ticketKeys } from './queryKeys.js'

afterEach(() => resetAuthIntegrationForTests())

describe('private client-state cleanup', () => {
  it('cancels protected requests and clears private caches without removing public data', async () => {
    const queryClient = createAppQueryClient()
    queryClient.setQueryData(publicKeys.health(), { status: 'ok' })
    queryClient.setQueryData(ticketKeys.detail('ticket-1'), { title: 'Private ticket' })
    queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['private-command'],
      mutationFn: async () => undefined,
    })
    replaceCsrfToken('csrf-private')

    server.use(
      http.get('http://deskflow.test/api/v1/private-slow', async () => {
        await delay(1000)
        return HttpResponse.json({ data: { completed: true } })
      }),
    )
    const pendingRequest = createHttpClient({
      baseUrl: 'http://deskflow.test/api/v1',
    }).get('/private-slow')

    await clearPrivateClientState(queryClient)
    const cancellation = await pendingRequest.catch((error) => error)

    expect(cancellation.name).toBe('AbortError')
    expect(queryClient.getQueryData(publicKeys.health())).toEqual({ status: 'ok' })
    expect(queryClient.getQueryData(ticketKeys.detail('ticket-1'))).toBeUndefined()
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(getCsrfToken()).toBeNull()
  })
})
