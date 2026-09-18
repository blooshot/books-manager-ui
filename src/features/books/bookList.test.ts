import { describe, expect, it } from 'vitest'
import { filterBookItems, parseStatus, selectBookListItems, sortLoansNewestFirst, type BookListItem } from '@/features/books/bookList'
import { makeStore } from '@/store'
import { booksLoaded } from '@/store/booksSlice'
import { loansLoaded } from '@/store/borrowersSlice'
import type { Book, Loan } from '@/types/library'

const book = (id: string, title: string, author = 'Anon'): Book => ({ id, title, author })
const loan = (key: string, bookId: string, extra: Partial<Loan> = {}): Loan => ({
  key,
  bookId,
  borrowerName: 'Ravi',
  borrowedDate: '2026-02-01',
  borrowedTime: '10:00',
  place: 'Home',
  returned: false,
  ...extra,
})
const item = (b: Book, open?: Loan): BookListItem => ({ book: b, openLoan: open })

describe('selectBookListItems', () => {
  it('sorts by title ignoring case, then ID, and attaches only open loans', () => {
    const store = makeStore()
    store.dispatch(booksLoaded([book('B-0003', 'emma'), book('B-0001', 'Dune'), book('B-0002', 'Dune'), book('B-0004', 'Zen')]))
    store.dispatch(
      loansLoaded([loan('a', 'B-0003'), loan('b', 'B-0001', { returned: true, returnedDate: '2026-02-09' })]),
    )
    const items = selectBookListItems(store.getState())
    expect(items.map((i) => i.book.id)).toEqual(['B-0001', 'B-0002', 'B-0003', 'B-0004'])
    expect(items.map((i) => Boolean(i.openLoan))).toEqual([false, false, true, false])
  })
})

describe('filterBookItems', () => {
  const items = [
    item(book('B-0001', 'Dune', 'Frank Herbert')),
    item(book('B-0002', 'Emma', 'Jane Austen'), loan('l', 'B-0002')),
    item(book('B-0003', 'Dune Messiah', 'Frank Herbert'), loan('m', 'B-0003')),
  ]
  const ids = (found: BookListItem[]) => found.map((i) => i.book.id)

  it('returns everything for an empty query and "all"', () => {
    expect(ids(filterBookItems(items, { query: '', status: 'all' }))).toEqual(['B-0001', 'B-0002', 'B-0003'])
    expect(ids(filterBookItems(items, { query: '   ', status: 'all' }))).toHaveLength(3)
  })

  it('matches title, author, and Book ID, case-insensitively', () => {
    expect(ids(filterBookItems(items, { query: 'DUNE', status: 'all' }))).toEqual(['B-0001', 'B-0003'])
    expect(ids(filterBookItems(items, { query: 'austen', status: 'all' }))).toEqual(['B-0002'])
    expect(ids(filterBookItems(items, { query: 'b-0003', status: 'all' }))).toEqual(['B-0003'])
  })

  it('requires every word to match, in any order and across fields', () => {
    expect(ids(filterBookItems(items, { query: 'herbert messiah', status: 'all' }))).toEqual(['B-0003'])
    expect(ids(filterBookItems(items, { query: 'dune austen', status: 'all' }))).toEqual([])
  })

  it('filters by status, combined with the query', () => {
    expect(ids(filterBookItems(items, { query: '', status: 'available' }))).toEqual(['B-0001'])
    expect(ids(filterBookItems(items, { query: '', status: 'borrowed' }))).toEqual(['B-0002', 'B-0003'])
    expect(ids(filterBookItems(items, { query: 'dune', status: 'borrowed' }))).toEqual(['B-0003'])
  })
})

describe('parseStatus', () => {
  it('accepts the known filters and treats anything else as all', () => {
    expect(parseStatus('available')).toBe('available')
    expect(parseStatus('borrowed')).toBe('borrowed')
    expect(parseStatus('all')).toBe('all')
    expect(parseStatus(null)).toBe('all')
    expect(parseStatus('deleted')).toBe('all')
  })
})

describe('sortLoansNewestFirst', () => {
  it('orders by borrowed date then time, newest first, without mutating the input', () => {
    const input = [
      loan('a', 'B', { borrowedDate: '2026-01-05', borrowedTime: '09:00' }),
      loan('b', 'B', { borrowedDate: '2026-03-01', borrowedTime: '08:00' }),
      loan('c', 'B', { borrowedDate: '2026-03-01', borrowedTime: '17:30' }),
    ]
    expect(sortLoansNewestFirst(input).map((l) => l.key)).toEqual(['c', 'b', 'a'])
    expect(input.map((l) => l.key)).toEqual(['a', 'b', 'c'])
  })
})
