import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { tokenExpired } from '@/store/sessionSlice'

/** Flips the session to 'expired' shortly before the access token stops working. */
const EXPIRY_MARGIN_MS = 60_000

export function useTokenExpiry(): void {
  const dispatch = useAppDispatch()
  const status = useAppSelector((s) => s.session.status)
  const expiresAt = useAppSelector((s) => s.session.expiresAt)

  useEffect(() => {
    if (status !== 'signedIn' || expiresAt === null) return
    const delay = Math.max(0, expiresAt - EXPIRY_MARGIN_MS - Date.now())
    const timer = window.setTimeout(() => dispatch(tokenExpired()), delay)
    return () => window.clearTimeout(timer)
  }, [status, expiresAt, dispatch])
}
