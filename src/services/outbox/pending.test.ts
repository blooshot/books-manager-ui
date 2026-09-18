import { describe, expect, it } from 'vitest'
import { GoogleApiError, SessionExpiredError, isRetryableFailure } from '@/services/google/errors'
import { SheetsError, ValidationError } from '@/services/sheets/errors'
import { DriveError } from '@/services/drive/errors'
import { applyPending, describeOp, pendingLoanKey } from '@/services/outbox/pending'
import type { OutboxEntry, OutboxOp } from '@/services/outbox/types'
import type { Book, Loan } from '@/types/library'

const books: Book[] = [
  { id: 'B-0001', title: 'Dune', author: 'Herbert', pricePaid: 500, marketPrice: 900 },
  { id: 'B-0002', title: 'Emma', author: 'Austen' },
]
const openLoan = (bookId: string): Loan => ({ key: `${bookId}|2`, bookId, borrowerName: 'Ravi', borrowedDate: '2026-09-01', borrowedTime: '10:00', place: 'Home', returned: false })
const entry = (seq: number, op: OutboxOp, status: OutboxEntry['status'] = 'pending'): OutboxEntry => ({
  seq,
  op,
  status,
  attempts: 0,
  summary: '',
  createdAt: '2026-09-18T14:05:00.000Z',
})
const borrow = (bookId: string, borrowerName = 'Asha'): OutboxOp => ({
  kind: 'borrow',
  input: { bookId, borrowerName, place: 'Cafe', borrowedDate: '2026-09-18', borrowedTime: '14:05' },
})

describe('isRetryableFailure', () => {
  it('retries an expired session and a network failure', () => {
    expect(isRetryableFailure(new SessionExpiredError())).toBe(true)
    expect(isRetryableFailure(new SheetsError('offline'))).toBe(true) // no status -> code NETWORK
    expect(isRetryableFailure(new DriveError('offline'))).toBe(true)
  })

  it.each([
    ['a 500', new SheetsError('boom', 500)],
    ['a 403', new GoogleApiError('no', 403)],
    ['a 404', new DriveError('gone', 404)],
    ['a validation error', new ValidationError('Title is required.')],
    ['a plain Error', new Error('x')],
    ['a string', 'network'],
    ['undefined', undefined],
  ])('does not queue %s', (_label, error) => {
    expect(isRetryableFailure(error)).toBe(false)
  })
})

describe('applyPending', () => {
  it('leaves the data alone when nothing is pending, without sharing objects with the input', () => {
    const result = applyPending(books, [openLoan('B-0001')], [])
    expect(result.books).toEqual(books)
    expect(result.books[0]).not.toBe(books[0])
  })

  it('applies a queued edit, and null clears a field', () => {
    const result = applyPending(books, [], [entry(1, { kind: 'editBook', bookId: 'B-0001', patch: { title: 'Dune Messiah', marketPrice: null }, hasPhoto: false })])
    expect(result.books[0]).toMatchObject({ title: 'Dune Messiah', pricePaid: 500 })
    expect(result.books[0].marketPrice).toBeUndefined()
    expect(books[0].title).toBe('Dune') // input untouched
  })

  it('shows a queued borrow as a temporary open loan', () => {
    const result = applyPending(books, [], [entry(1, borrow('B-0002'))])
    expect(result.loans).toEqual([
      { key: pendingLoanKey('B-0002'), bookId: 'B-0002', borrowerName: 'Asha', borrowedDate: '2026-09-18', borrowedTime: '14:05', place: 'Cafe', returned: false },
    ])
  })

  it('ignores a queued borrow for a book someone already has (the conflict shows when it is sent)', () => {
    const result = applyPending(books, [openLoan('B-0002')], [entry(1, borrow('B-0002'))])
    expect(result.loans).toHaveLength(1)
    expect(result.loans[0].borrowerName).toBe('Ravi')
  })

  it('applies a queued return to the open loan', () => {
    const result = applyPending(books, [openLoan('B-0001')], [entry(1, { kind: 'return', bookId: 'B-0001', returnedDate: '2026-09-18', returnedTime: '14:05' })])
    expect(result.loans[0]).toMatchObject({ returned: true, returnedDate: '2026-09-18', returnedTime: '14:05' })
  })

  it('applies entries in sequence order whatever order they arrive in: borrow, then return', () => {
    const entries = [
      entry(2, { kind: 'return', bookId: 'B-0002', returnedDate: '2026-09-18', returnedTime: '15:00' }),
      entry(1, borrow('B-0002')),
    ]
    const result = applyPending(books, [], entries)
    expect(result.loans).toHaveLength(1)
    expect(result.loans[0]).toMatchObject({ borrowerName: 'Asha', returned: true, returnedTime: '15:00' })
  })

  it('does not apply failed entries, and skips edits for books that are gone', () => {
    const failed = entry(1, { kind: 'editBook', bookId: 'B-0001', patch: { title: 'X' }, hasPhoto: false }, 'failed')
    const missing = entry(2, { kind: 'editBook', bookId: 'B-9999', patch: { title: 'Y' }, hasPhoto: false })
    const result = applyPending(books, [], [failed, missing])
    expect(result.books.map((b) => b.title)).toEqual(['Dune', 'Emma'])
  })

  it('does not show a queued add among the books (it has no ID until it is written)', () => {
    const add = entry(1, { kind: 'addBook', input: { title: 'New', author: 'A' }, addedAt: '2026-09-18T14:05:00.000Z', hasPhoto: false })
    expect(applyPending(books, [], [add]).books).toHaveLength(2)
  })
})

describe('describeOp', () => {
  const titleOf = (id: string) => (id === 'B-0001' ? 'Dune' : undefined)

  it('describes each kind in one line', () => {
    expect(describeOp({ kind: 'addBook', input: { title: 'Emma', author: 'Austen' }, addedAt: 'x', hasPhoto: true }, titleOf)).toBe('Add “Emma” by Austen (with cover photo)')
    expect(describeOp({ kind: 'addBook', input: { title: 'Emma', author: 'Austen' }, addedAt: 'x', hasPhoto: false }, titleOf)).toBe('Add “Emma” by Austen')
    expect(describeOp(borrow('B-0001', 'Ravi'), titleOf)).toBe('Lend “Dune” to Ravi')
    expect(describeOp({ kind: 'return', bookId: 'B-0001', returnedDate: 'd', returnedTime: 't' }, titleOf)).toBe('Mark “Dune” as returned')
  })

  it('lists what an edit changes, and falls back to the Book ID for an unknown title', () => {
    expect(describeOp({ kind: 'editBook', bookId: 'B-0001', patch: { title: 'x', marketPrice: 1 }, hasPhoto: true }, titleOf)).toBe('Edit “Dune” (title, market price, cover photo)')
    expect(describeOp({ kind: 'return', bookId: 'B-0777', returnedDate: 'd', returnedTime: 't' }, titleOf)).toBe('Mark “B-0777” as returned')
  })
})
