import AppProviders from './AppProviders.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { AppRouter } from './router.jsx'

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders withAuth={false}>
        <AppRouter />
      </AppProviders>
    </ErrorBoundary>
  )
}
