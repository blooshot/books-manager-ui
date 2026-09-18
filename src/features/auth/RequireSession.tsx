import { Navigate, Outlet, useLocation } from 'react-router'
import { useAppSelector } from '@/store/hooks'

/**
 * Everything except /login needs a session. Signed out: go to /login, remembering where you were heading so a
 * successful sign-in returns you there (a deep link to a book survives). If you signed out on purpose, the next
 * sign-in starts at the home page instead. An *expired* session stays put: the reconnect banner handles it, so
 * nothing you were doing is lost.
 */
export function RequireSession() {
  const status = useAppSelector((s) => s.session.status)
  const signedOutByUser = useAppSelector((s) => s.session.signedOutByUser)
  const location = useLocation()
  if (status === 'signedIn' || status === 'expired') return <Outlet />
  return <Navigate to="/login" replace state={signedOutByUser ? undefined : { from: location }} />
}
