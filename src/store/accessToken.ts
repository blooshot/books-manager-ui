import { SessionExpiredError } from '@/services/google/errors'
import type { RootState } from '@/store'

/**
 * A function that returns the current access token from the store, at call time.
 * No token, or one past its expiry, throws SessionExpiredError (so no request is made).
 * Shared by every Google API client (Sheets, Drive, cover loading).
 */
export function accessTokenGetter(getState: () => RootState, now: () => Date = () => new Date()) {
  return () => {
    const { accessToken, expiresAt } = getState().session
    if (!accessToken || (expiresAt !== null && expiresAt <= now().getTime())) throw new SessionExpiredError()
    return accessToken
  }
}
