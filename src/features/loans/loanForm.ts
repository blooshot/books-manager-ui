import { formatDate, formatTime, isRealIsoDate, isValidTime } from '@/lib/datetime'
import type { Loan } from '@/types/library'

export interface BorrowFormValues {
  borrowerName: string
  place: string
  date: string
  time: string
}

export interface ReturnFormValues {
  date: string
  time: string
}

export type LoanFormErrors = Partial<Record<'borrowerName' | 'date' | 'time', string>>

/** Date and time fields start at "now" (AGENTS.md > Screens). */
export function defaultDateTime(now: Date): { date: string; time: string } {
  return { date: formatDate(now), time: formatTime(now) }
}

function checkDateTime(values: { date: string; time: string }, errors: LoanFormErrors) {
  if (!isRealIsoDate(values.date)) errors.date = 'Enter a valid date.'
  if (!isValidTime(values.time)) errors.time = 'Enter a valid time as hh:mm.'
}

export function validateBorrowForm(values: BorrowFormValues): LoanFormErrors {
  const errors: LoanFormErrors = {}
  if (values.borrowerName.trim() === '') errors.borrowerName = 'Enter who is borrowing the book.'
  checkDateTime(values, errors)
  return errors
}

/** A return must be valid and not earlier than the loan (ISO date and time strings compare as text). */
export function validateReturnForm(values: ReturnFormValues, loan: Pick<Loan, 'borrowedDate' | 'borrowedTime'>): LoanFormErrors {
  const errors: LoanFormErrors = {}
  checkDateTime(values, errors)
  if (!errors.date && !errors.time && `${values.date} ${values.time}` < `${loan.borrowedDate} ${loan.borrowedTime}`) {
    errors.date = `A book can't be returned before it was borrowed (${loan.borrowedDate} ${loan.borrowedTime}).`
  }
  return errors
}

/**
 * Names for autocomplete, from every past loan: one per person (ignoring case and spacing), spelled the way
 * they were most recently entered, sorted alphabetically.
 */
export function pastBorrowerNames(loans: Loan[]): string[] {
  const newestFirst = [...loans].sort((a, b) => `${b.borrowedDate} ${b.borrowedTime}`.localeCompare(`${a.borrowedDate} ${a.borrowedTime}`))
  const seen = new Map<string, string>()
  for (const loan of newestFirst) {
    const name = loan.borrowerName.trim()
    const key = name.toLowerCase()
    if (name !== '' && !seen.has(key)) seen.set(key, name)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/** Failures the user can fix by refreshing, because the screen was showing out-of-date data. */
const STALE_ERRORS = new Set(['AlreadyBorrowedError', 'NotBorrowedError', 'BookNotFoundError'])

/** Turns a rejected borrow/return thunk (a serialized error: name, message, code) into text for the user. */
export function describeLoanError(error: { name?: string; message?: string }): { message: string; stale: boolean } {
  if (error.name === 'SessionExpiredError') {
    return { message: 'Your Google session has expired. Reconnect using the banner above, then try again. Nothing was saved.', stale: false }
  }
  const stale = STALE_ERRORS.has(error.name ?? '')
  const base = error.message || 'Could not save. Try again.'
  return { message: stale ? `${base} The list may be out of date.` : base, stale }
}
