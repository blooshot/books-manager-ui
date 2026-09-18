import { Navigate, useLocation, type Location } from 'react-router'
import { SignInGate } from '@/features/auth/SignInGate'
import { useAppSelector } from '@/store/hooks'

/** `/login`: the sign-in screen. Once signed in, go where you were heading (or home), never staying on the login page. */
export function LoginRoute() {
  const status = useAppSelector((s) => s.session.status)
  const location = useLocation()
  if (status === 'signedIn' || status === 'expired') {
    const from = (location.state as { from?: Location } | null)?.from
    const target = from && from.pathname !== '/login' ? `${from.pathname}${from.search}${from.hash}` : '/'
    return <Navigate to={target} replace />
  }
  return <SignInGate />
}
