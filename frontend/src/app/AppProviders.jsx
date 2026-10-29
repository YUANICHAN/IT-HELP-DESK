import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient as sharedQueryClient } from './queryClient.js'
import ToastProvider from '../shared/feedback/ToastProvider.jsx'

export default function AppProviders({ children, queryClient = sharedQueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}
