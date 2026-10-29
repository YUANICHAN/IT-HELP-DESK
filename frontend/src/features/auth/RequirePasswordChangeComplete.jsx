import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth.js'

export default function RequirePasswordChangeComplete({ children }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.user.mustChangePassword) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate replace state={{ from }} to="/change-password" />
  }

  return children || <Outlet />
}
