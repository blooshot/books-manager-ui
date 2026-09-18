/** Errors raised by the Sheets service layer. Names are stable so they survive Redux serialization. */

import { GoogleApiError, SessionExpiredError } from '@/services/google/errors'

export { SessionExpiredError }

export class SheetsError extends GoogleApiError {
  constructor(message: string, status?: number) {
    super(message, status)
    this.name = 'SheetsError'
  }
}

/** 403: signed in with an account that cannot open the Sheet ("wrong account"). */
export class SheetsPermissionError extends SheetsError {
  constructor(message = 'This Google account cannot open the library Sheet. Try a different account.') {
    super(message, 403)
    this.name = 'SheetsPermissionError'
  }
}

/** A tab is missing columns the app needs. */
export class SheetSchemaError extends Error {
  constructor(tab: string, missing: string[]) {
    super(`Tab "${tab}" is missing column(s): ${missing.join(', ')}. Check the header row.`)
    this.name = 'SheetSchemaError'
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class BookNotFoundError extends Error {
  constructor(bookId: string) {
    super(`Book ${bookId} was not found in the Sheet.`)
    this.name = 'BookNotFoundError'
  }
}

export class AlreadyBorrowedError extends Error {
  constructor(bookId: string, borrower: string) {
    super(`Book ${bookId} is already borrowed by ${borrower}.`)
    this.name = 'AlreadyBorrowedError'
  }
}

export class NotBorrowedError extends Error {
  constructor(bookId: string) {
    super(`Book ${bookId} is not currently borrowed.`)
    this.name = 'NotBorrowedError'
  }
}
