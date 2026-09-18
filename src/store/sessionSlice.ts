import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { readStored, removeStored, writeStored } from '@/lib/storage'
import { fetchUserEmail, requestAccessToken, revokeAccessToken } from '@/services/google/gis'
import type { RootState } from '@/store'

/** The only thing persisted about the session. Never the token (ADR-0002). */
const EMAIL_HINT_KEY = 'bm.emailHint'

export type SessionStatus = 'signedOut' | 'signingIn' | 'signedIn' | 'expired'

export interface SessionState {
  status: SessionStatus
  /** In memory only. */
  accessToken: string | null
  expiresAt: number | null
  /** Remembered email, for "Continue as ...". */
  email: string | null
  error: string | null
  /** The user chose to sign out (as opposed to never having signed in): the next sign-in starts at the home page. */
  signedOutByUser: boolean
}

const initialState: SessionState = {
  status: 'signedOut',
  accessToken: null,
  expiresAt: null,
  email: readStored(EMAIL_HINT_KEY),
  error: null,
  signedOutByUser: false,
}

interface SignInResult {
  accessToken: string
  expiresAt: number
  email: string | null
}

/**
 * Sign in, or reconnect after expiry. Call from a click handler (popup rules).
 * The remembered email is passed as a hint so Google skips the account chooser.
 */
export const signIn = createAsyncThunk<SignInResult, void, { state: RootState }>(
  'session/signIn',
  async (_arg, { getState }) => {
    const hint = getState().session.email ?? undefined
    const token = await requestAccessToken({ hint, prompt: '' })
    const email = (await fetchUserEmail(token.accessToken)) ?? hint ?? null
    return { ...token, email }
  },
)

/**
 * Signing out is instant. The token is revoked at Google in the background: the revoke call only returns when the
 * network does, and an early sign-out (or one while offline) must never hang waiting for it.
 * The other slices clear their data on this action, so nothing of the library stays in memory.
 */
export const signOut = createAsyncThunk<void, void, { state: RootState }>(
  'session/signOut',
  async (_arg, { getState }) => {
    const token = getState().session.accessToken
    if (token) void revokeAccessToken(token)
  },
)

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    /** Dispatched by the expiry timer or by a 401 from any API call. */
    tokenExpired(state) {
      if (state.status === 'signedIn') {
        state.status = 'expired'
        state.accessToken = null
      }
    },
    /** "Use a different account": drop the remembered email. */
    forgetEmail(state) {
      state.email = null
      removeStored(EMAIL_HINT_KEY)
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signIn.pending, (state) => {
        state.status = state.status === 'expired' ? 'expired' : 'signingIn'
        state.error = null
        state.signedOutByUser = false
      })
      .addCase(signIn.fulfilled, (state, { payload }) => {
        state.status = 'signedIn'
        state.accessToken = payload.accessToken
        state.expiresAt = payload.expiresAt
        state.email = payload.email
        state.error = null
        if (payload.email) writeStored(EMAIL_HINT_KEY, payload.email)
      })
      .addCase(signIn.rejected, (state, { error }) => {
        // Keep 'expired' so the reconnect banner stays; otherwise back to the gate.
        state.status = state.status === 'expired' ? 'expired' : 'signedOut'
        state.error = error.message ?? 'Sign-in failed.'
      })
      .addCase(signOut.fulfilled, (state) => {
        state.status = 'signedOut'
        state.accessToken = null
        state.expiresAt = null
        state.error = null
        state.signedOutByUser = true
      })
  },
})

export const { tokenExpired, forgetEmail } = sessionSlice.actions
export default sessionSlice.reducer
