import { lazy, Suspense } from 'react'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import FoundationPage from '../pages/FoundationPage.jsx'
import NotFoundPage from '../pages/NotFoundPage.jsx'
import SignInPage from '../pages/SignInPage.jsx'
import ChangePasswordPage from '../pages/ChangePasswordPage.jsx'
import SecurityPage from '../pages/SecurityPage.jsx'
import AuthLayout from '../layouts/AuthLayout.jsx'
import RequireAuth from '../features/auth/RequireAuth.jsx'
import RequirePasswordChangeComplete from '../features/auth/RequirePasswordChangeComplete.jsx'
import AuthProvider from '../features/auth/AuthProvider.jsx'
import Spinner from '../shared/components/Spinner.jsx'
import { routeMeta } from './routeMeta.js'

const ComponentPreviewPage = import.meta.env.DEV
  ? lazy(() => import('../dev/ComponentPreviewPage.jsx'))
  : null

function AuthBoundary() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}

export function AppRoutes() {
  return (
    <Routes>
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
      <Route element={<AuthBoundary />}>
        <Route element={<AuthLayout />}>
          <Route path={routeMeta.signIn.path} element={<SignInPage />} />
          <Route element={<RequireAuth />}>
            <Route
              path={routeMeta.changePassword.path}
              element={<ChangePasswordPage />}
            />
          </Route>
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<RequirePasswordChangeComplete />}>
            <Route path={routeMeta.foundation.path} element={<FoundationPage />} />
            <Route path={routeMeta.security.path} element={<SecurityPage />} />
          </Route>
        </Route>
        <Route path={routeMeta.notFound.path} element={<NotFoundPage />} />
      </Route>
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
