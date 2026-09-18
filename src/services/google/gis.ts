import { config, GOOGLE_SCOPES } from '@/lib/config'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

let gisLoading: Promise<void> | null = null

/** Loads the Google Identity Services script once. */
export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      gisLoading = null
      reject(new Error('Could not load Google sign-in. Check your connection.'))
    }
    document.head.appendChild(script)
  })
  return gisLoading
}

export interface AccessToken {
  accessToken: string
  /** Epoch ms when the token stops working. */
  expiresAt: number
}

export interface TokenRequest {
  /** Email to preselect (skips the account chooser). */
  hint?: string
  /** '' = no prompt if already granted; 'consent' / 'select_account' force UI. */
  prompt?: '' | 'consent' | 'select_account'
}

/**
 * Requests an access token via the GIS token client (ADR-0002).
 * Must be called from a user gesture, otherwise the browser may block the popup.
 * There is no refresh token: an expired token means asking again.
 */
export async function requestAccessToken({ hint, prompt = '' }: TokenRequest = {}): Promise<AccessToken> {
  await loadGis()
  return new Promise<AccessToken>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: GOOGLE_SCOPES,
      hint,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description ?? response.error ?? 'Sign-in failed.'))
          return
        }
        resolve({
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in) * 1000,
        })
      },
      error_callback: (error) => {
        reject(new Error(error.type === 'popup_closed' ? 'Sign-in was cancelled.' : 'Sign-in failed.'))
      },
    })
    client.requestAccessToken({ prompt })
  })
}

/** Fetches the signed-in user's email (used only for the "Continue as ..." hint). */
export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null
  const info = (await response.json()) as { email?: string }
  return info.email ?? null
}

/** Revokes the token at Google (sign-out). Resolves even if revocation fails. */
export function revokeAccessToken(accessToken: string): Promise<void> {
  return new Promise((resolve) => {
    if (!window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    google.accounts.oauth2.revoke(accessToken, () => resolve())
  })
}
