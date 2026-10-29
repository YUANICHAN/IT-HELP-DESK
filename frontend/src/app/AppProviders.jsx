import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient as sharedQueryClient } from './queryClient.js'
import ToastProvider from '../shared/feedback/ToastProvider.jsx'
import AuthProvider from '../features/auth/AuthProvider.jsx'

export default function AppProviders({
  children,
  queryClient = sharedQueryClient,
  withAuth = true,
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {withAuth ? <AuthProvider>{children}</AuthProvider> : children}
      </ToastProvider>
    </QueryClientProvider>
  )
}
