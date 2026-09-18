/** Errors raised by the Drive service layer. */

export class DriveError extends Error {
  status?: number
  code: string

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'DriveError'
    this.status = status
    this.code = status === undefined ? 'NETWORK' : String(status)
  }
}

/** 
 * We reuse the 'SessionExpiredError' name so the outbox correctly identifies 401s
 * and can trigger the reconnect banner, just like Sheets.
 */
export class SessionExpiredError extends DriveError {
  constructor(message = 'Your Google session has expired. Reconnect to continue.') {
    super(message, 401)
    this.name = 'SessionExpiredError'
  }
}

/** 403 from Drive API. */
export class DrivePermissionError extends DriveError {
  constructor(message = 'This Google account does not have permission to access the Drive folder.') {
    super(message, 403)
    this.name = 'DrivePermissionError'
  }
}
