import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeStore } from '@/store'
import { signIn, tokenExpired } from '@/store/sessionSlice'
import * as gis from '@/services/google/gis'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('session', () => {
  it('signs in, remembers only the email, and never persists the token', async () => {
    vi.spyOn(gis, 'requestAccessToken').mockResolvedValue({
      accessToken: 'secret-token',
      expiresAt: Date.now() + 3_600_000,
    })
    vi.spyOn(gis, 'fetchUserEmail').mockResolvedValue('me@example.com')

    const store = makeStore()
    await store.dispatch(signIn())

    const { session } = store.getState()
    expect(session.status).toBe('signedIn')
    expect(session.email).toBe('me@example.com')
    expect(window.localStorage.getItem('bm.emailHint')).toBe('me@example.com')

    const persisted = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage })
    expect(persisted).not.toContain('secret-token')
  })

  it('moves to expired (keeping the email) when the token expires', async () => {
    vi.spyOn(gis, 'requestAccessToken').mockResolvedValue({
      accessToken: 't',
      expiresAt: Date.now() + 3_600_000,
    })
    vi.spyOn(gis, 'fetchUserEmail').mockResolvedValue('me@example.com')

    const store = makeStore()
    await store.dispatch(signIn())
    store.dispatch(tokenExpired())

    const { session } = store.getState()
    expect(session.status).toBe('expired')
    expect(session.accessToken).toBeNull()
    expect(session.email).toBe('me@example.com')
  })

  it('returns to the sign-in gate with an error when sign-in fails', async () => {
    vi.spyOn(gis, 'requestAccessToken').mockRejectedValue(new Error('Sign-in was cancelled.'))

    const store = makeStore()
    await store.dispatch(signIn())

    const { session } = store.getState()
    expect(session.status).toBe('signedOut')
    expect(session.error).toBe('Sign-in was cancelled.')
  })
})
