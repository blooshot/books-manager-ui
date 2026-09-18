/**
 * Error base shared by every Google API wrapper (Sheets, Drive).
 * Redux Toolkit serializes thunk errors and keeps only name/message/stack/code, so
 * callers and the outbox tell failures apart by `name` and `code`, never `instanceof`/`status`.
 */
export class GoogleApiError extends Error {
  /** HTTP status when the failure came from the API; undefined for network failures. */
  status?: number
  /** `'401'`, `'500'`, ... or `'NETWORK'`. */
  code: string
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GoogleApiError'
    this.status = status
    this.code = status === undefined ? 'NETWORK' : String(status)
  }
}

/**
 * 401: the access token is missing or expired. The write did not happen, so retrying is safe.
 * One class for every Google API so a single `instanceof` check (and the reconnect banner) covers both.
 */
export class SessionExpiredError extends GoogleApiError {
  constructor(message = 'Your Google session has expired. Reconnect to continue.') {
    super(message, 401)
    this.name = 'SessionExpiredError'
  }
}

/**
 * Whether a failed write is worth queueing for later: the token expired (nothing was written) or the network
 * failed. Anything else (validation, conflicts, 4xx/5xx) is reported to the user instead, because retrying
 * it unchanged would not help.
 */
export function isRetryableFailure(error: unknown): boolean {
  return error instanceof SessionExpiredError || (error instanceof GoogleApiError && error.code === 'NETWORK')
}

