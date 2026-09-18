import { createSelector } from '@reduxjs/toolkit'
import { booksSelectors, selectOpenLoanByBookId } from '@/store/selectors'
import type { Book, Loan } from '@/types/library'

export interface BookListItem {
  book: Book
  /** The loan that is still out, if any. No open loan means the book is available. */
  openLoan?: Loan
}

export type StatusFilter = 'all' | 'available' | 'borrowed'

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'borrowed', label: 'Borrowed' },
]

/** Every book with its open loan, sorted by title (case-insensitive), then by ID. */
export const selectBookListItems = createSelector(
  [booksSelectors.selectAll, selectOpenLoanByBookId],
  (books, openLoans): BookListItem[] =>
    books
      .map((book) => ({ book, openLoan: openLoans.get(book.id) }))
      .sort(
        (a, b) =>
          a.book.title.localeCompare(b.book.title, undefined, { sensitivity: 'base' }) || a.book.id.localeCompare(b.book.id),
      ),
)

/** Unknown or missing values (e.g. from a hand-edited URL) mean "all". */
export function parseStatus(value: string | null): StatusFilter {
  return value === 'available' || value === 'borrowed' ? value : 'all'
}

/** Every search word must appear in the title, author, or Book ID (case-insensitive). */
export function filterBookItems(items: BookListItem[], { query, status }: { query: string; status: StatusFilter }): BookListItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(({ book, openLoan }) => {
    if (status === 'available' && openLoan) return false
    if (status === 'borrowed' && !openLoan) return false
    const haystack = `${book.title} ${book.author} ${book.id}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

/** Newest loan first, by borrowed date and time (ISO strings sort correctly as text). */
export function sortLoansNewestFirst(loans: Loan[]): Loan[] {
  const key = (loan: Loan) => `${loan.borrowedDate} ${loan.borrowedTime}`
  return [...loans].sort((a, b) => key(b).localeCompare(key(a)))
}
