import { BrowserRouter, Route, Routes } from 'react-router-dom'
import FoundationPage from '../pages/FoundationPage.jsx'
import NotFoundPage from '../pages/NotFoundPage.jsx'
import { routeMeta } from './routeMeta.js'

export function AppRoutes() {
  return (
    <Routes>
      <Route path={routeMeta.foundation.path} element={<FoundationPage />} />
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
