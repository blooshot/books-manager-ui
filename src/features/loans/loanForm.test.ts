import { describe, expect, it } from 'vitest'
import { defaultDateTime, describeLoanError, pastBorrowerNames, validateBorrowForm, validateReturnForm } from '@/features/loans/loanForm'
import type { Loan } from '@/types/library'

const loan = (borrowerName: string, borrowedDate = '2026-01-01', borrowedTime = '09:00'): Loan => ({
  key: `${borrowerName}${borrowedDate}${borrowedTime}`,
  bookId: 'B-0001',
  borrowerName,
  borrowedDate,
  borrowedTime,
  place: '',
  returned: false,
})

describe('defaultDateTime', () => {
  it('uses the local date and time, zero-padded', () => {
    expect(defaultDateTime(new Date(2026, 0, 5, 7, 3))).toEqual({ date: '2026-01-05', time: '07:03' })
  })
})

describe('validateBorrowForm', () => {
  const ok = { borrowerName: 'Ravi', place: '', date: '2026-09-18', time: '14:05' }

  it('accepts a name with a valid date and time; place is optional', () => {
    expect(validateBorrowForm(ok)).toEqual({})
  })

  it('requires a name, ignoring whitespace', () => {
    expect(validateBorrowForm({ ...ok, borrowerName: '   ' }).borrowerName).toMatch(/who is borrowing/)
  })

  it.each(['', '2026-02-30', '18/09/2026', 'today'])('rejects the date %j', (date) => {
    expect(validateBorrowForm({ ...ok, date }).date).toBeDefined()
  })

  it.each(['', '24:00', '9:05', '12:60', 'noon'])('rejects the time %j', (time) => {
    expect(validateBorrowForm({ ...ok, time }).time).toMatch(/hh:mm/)
  })

  it('accepts midnight and the last minute of the day', () => {
    expect(validateBorrowForm({ ...ok, time: '00:00' })).toEqual({})
    expect(validateBorrowForm({ ...ok, time: '23:59' })).toEqual({})
  })
})

describe('validateReturnForm', () => {
  const borrowed = { borrowedDate: '2026-03-10', borrowedTime: '10:00' }

  it('accepts a return after, and exactly at, the borrowed time', () => {
    expect(validateReturnForm({ date: '2026-03-10', time: '10:01' }, borrowed)).toEqual({})
    expect(validateReturnForm({ date: '2026-03-10', time: '10:00' }, borrowed)).toEqual({})
    expect(validateReturnForm({ date: '2026-04-01', time: '00:00' }, borrowed)).toEqual({})
  })

  it('rejects a return before the book was borrowed, naming when it was borrowed', () => {
    expect(validateReturnForm({ date: '2026-03-10', time: '09:59' }, borrowed).date).toContain('2026-03-10 10:00')
    expect(validateReturnForm({ date: '2026-03-09', time: '23:00' }, borrowed).date).toBeDefined()
  })

  it('reports a malformed date or time instead of comparing it', () => {
    expect(validateReturnForm({ date: 'x', time: '10:00' }, borrowed)).toEqual({ date: 'Enter a valid date.' })
    expect(validateReturnForm({ date: '2026-03-10', time: 'x' }, borrowed)).toEqual({ time: 'Enter a valid time as hh:mm.' })
  })
})

describe('pastBorrowerNames', () => {
  it('lists each person once, ignoring case and spacing, sorted A-Z', () => {
    const loans = [loan('ravi', '2026-01-01'), loan('Asha', '2026-01-02'), loan(' RAVI ', '2026-01-03'), loan('Zoya', '2026-01-04')]
    expect(pastBorrowerNames(loans)).toEqual(['Asha', 'RAVI', 'Zoya'])
  })

  it('uses the spelling from the most recent loan', () => {
    const names = pastBorrowerNames([loan('ravi', '2026-01-01'), loan('Ravi K', '2026-02-01'), loan('RAVI', '2026-03-01')])
    expect(names).toEqual(['RAVI', 'Ravi K'])
  })

  it('ignores blank names and copes with no loans', () => {
    expect(pastBorrowerNames([loan('  '), loan('')])).toEqual([])
    expect(pastBorrowerNames([])).toEqual([])
  })

  it('does not change the input order', () => {
    const input = [loan('b', '2026-01-01'), loan('a', '2026-02-01')]
    pastBorrowerNames(input)
    expect(input.map((l) => l.borrowerName)).toEqual(['b', 'a'])
  })
})

describe('describeLoanError', () => {
  it('tells the user to reconnect on an expired session, without suggesting a refresh', () => {
    const result = describeLoanError({ name: 'SessionExpiredError', message: 'x' })
    expect(result.message).toMatch(/reconnect/i)
    expect(result.message).toMatch(/nothing was saved/i)
    expect(result.stale).toBe(false)
  })

  it.each(['AlreadyBorrowedError', 'NotBorrowedError', 'BookNotFoundError'])('marks %s as out-of-date data and keeps its message', (name) => {
    const result = describeLoanError({ name, message: 'Book B-0001 is already borrowed by Ravi.' })
    expect(result.stale).toBe(true)
    expect(result.message).toContain('Book B-0001 is already borrowed by Ravi.')
    expect(result.message).toMatch(/out of date/)
  })

  it('passes other messages through, with a fallback', () => {
    expect(describeLoanError({ name: 'SheetsError', message: 'Sheets is down' })).toEqual({ message: 'Sheets is down', stale: false })
    expect(describeLoanError({}).message).toMatch(/try again/i)
  })
})
