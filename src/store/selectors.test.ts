import { describe, expect, it } from 'vitest'
import { makeStore } from '@/store'
import { booksLoaded } from '@/store/booksSlice'
import { loansLoaded } from '@/store/borrowersSlice'
import { selectLentOutByBorrower, selectOpenLoanByBookId } from '@/store/selectors'
import type { Book, Loan } from '@/types/library'

const book = (id: string, title = id): Book => ({ id, title, author: 'A' })
const loan = (key: string, bookId: string, name: string, extra: Partial<Loan> = {}): Loan => ({
  key,
  bookId,
  borrowerName: name,
  borrowedDate: '2026-01-10',
  borrowedTime: '10:00',
  place: 'Home',
  returned: false,
  ...extra,
})

function storeWith(books: Book[], loans: Loan[]) {
  const store = makeStore()
  store.dispatch(booksLoaded(books))
  store.dispatch(loansLoaded(loans))
  return store
}

describe('open loans', () => {
  it('treats a loan without a returned date as open, even if Returned says Yes', () => {
    const store = storeWith(
      [book('B-0001')],
      [loan('B-0001|2', 'B-0001', 'Ravi', { returned: true })],
    )
    expect(selectOpenLoanByBookId(store.getState()).has('B-0001')).toBe(true)
  })

  it('treats a loan with a returned date as closed', () => {
    const store = storeWith(
      [book('B-0001')],
      [loan('B-0001|2', 'B-0001', 'Ravi', { returned: true, returnedDate: '2026-01-20' })],
    )
    expect(selectOpenLoanByBookId(store.getState()).size).toBe(0)
  })
})

describe('lent out by borrower', () => {
  it('groups open loans per borrower, oldest loan first, and skips unknown Book IDs', () => {
    const store = storeWith(
      [book('B-0001'), book('B-0002'), book('B-0003')],
      [
        loan('a', 'B-0002', 'Ravi', { borrowedDate: '2026-02-01' }),
        loan('b', 'B-0001', 'Ravi', { borrowedDate: '2026-01-05' }),
        loan('c', 'B-0003', 'Asha'),
        loan('d', 'B-9999', 'Asha'), // no such book
        loan('e', 'B-0003', 'Old', { returned: true, returnedDate: '2026-01-11' }),
      ],
    )
    const groups = selectLentOutByBorrower(store.getState())
    expect(groups.map((g) => g.borrowerName)).toEqual(['Asha', 'Ravi'])
    expect(groups[0].items.map((i) => i.book.id)).toEqual(['B-0003'])
    expect(groups[1].items.map((i) => i.book.id)).toEqual(['B-0001', 'B-0002'])
  })
})
