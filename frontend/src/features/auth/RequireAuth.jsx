import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth.js'

export default function RequireAuth({ children }) {
  const auth = useAuth()
  const location = useLocation()

  if (!auth.isAuthenticated) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate replace state={{ from }} to="/sign-in" />
  }

  return children || <Outlet />
}
