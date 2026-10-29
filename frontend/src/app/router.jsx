import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import FoundationPage from '../pages/FoundationPage.jsx'
import NotFoundPage from '../pages/NotFoundPage.jsx'
import Spinner from '../shared/components/Spinner.jsx'
import { routeMeta } from './routeMeta.js'

const ComponentPreviewPage = import.meta.env.DEV
  ? lazy(() => import('../dev/ComponentPreviewPage.jsx'))
  : null

export function AppRoutes() {
  return (
    <Routes>
      <Route path={routeMeta.foundation.path} element={<FoundationPage />} />
      {ComponentPreviewPage ? (
        <Route
          path={routeMeta.componentPreview.path}
          element={
            <Suspense
              fallback={
                <main aria-label="Loading component gallery">
                  <Spinner label="Loading component gallery" size="large" />
                </main>
              }
            >
              <ComponentPreviewPage />
            </Suspense>
          }
        />
      ) : null}
      <Route path={routeMeta.notFound.path} element={<NotFoundPage />} />
    </Routes>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
