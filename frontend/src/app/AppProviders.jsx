import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient as sharedQueryClient } from './queryClient.js'

export default function AppProviders({ children, queryClient = sharedQueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
