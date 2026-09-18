import { GoogleApiError, SessionExpiredError } from '@/services/google/errors'

/** Errors raised by the Drive service layer. `SessionExpiredError` is shared with Sheets. */
export { SessionExpiredError }

export class DriveError extends GoogleApiError {
  constructor(message: string, status?: number) {
    super(message, status)
    this.name = 'DriveError'
  }
}

/** 403 from the Drive API. */
export class DrivePermissionError extends DriveError {
  constructor(message = 'This Google account does not have permission to access the Drive folder.') {
    super(message, 403)
    this.name = 'DrivePermissionError'
  }
}
