import { createSelector } from '@reduxjs/toolkit'
import { booksSelectors, selectOpenLoanByBookId } from '@/store/selectors'
import type { Book, Loan } from '@/types/library'

export interface BookListItem {
  book: Book
  /** The loan that is still out, if any. No open loan means the book is available. */
  openLoan?: Loan
}

export type StatusFilter = 'all' | 'available' | 'borrowed' | 'archived'

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'borrowed', label: 'Borrowed' },
  { value: 'archived', label: 'Archived' },
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

export type SortOrder = 'title' | 'newest' | 'oldest'

export const SORT_ORDERS: { value: SortOrder; label: string }[] = [
  { value: 'title', label: 'Title A–Z' },
  { value: 'newest', label: 'Purchased: newest first' },
  { value: 'oldest', label: 'Purchased: oldest first' },
]

/** Unknown or missing values mean the default, title order. */
export function parseSort(value: string | null): SortOrder {
  return value === 'newest' || value === 'oldest' ? value : 'title'
}

/**
 * Title order is the store's own order. The purchase-date orders keep it as the tie-breaker, and books with no
 * purchase date always go last (in either direction), since "oldest first" should not open with unknowns.
 */
export function sortBookItems(items: BookListItem[], order: SortOrder): BookListItem[] {
  if (order === 'title') return items
  const direction = order === 'newest' ? -1 : 1
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const da = a.item.book.purchaseDate
      const db = b.item.book.purchaseDate
      if (da && db && da !== db) return da < db ? -direction : direction // yyyy-mm-dd sorts correctly as text
      if (Boolean(da) !== Boolean(db)) return da ? -1 : 1
      return a.index - b.index
    })
    .map(({ item }) => item)
}

/** Unknown or missing values (e.g. from a hand-edited URL) mean "all". */
export function parseStatus(value: string | null): StatusFilter {
  return value === 'available' || value === 'borrowed' || value === 'archived' ? value : 'all'
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export interface BookFilters {
  query: string
  status: StatusFilter
  /** Only books in this category (a book can be in several). Empty = any. */
  category?: string
  /** Only books in this language. Empty = any. */
  language?: string
}

/**
 * Every search word must appear in the title, author, or Book ID (case-insensitive); the status, category and language
 * filters must all match too.
 */
export function filterBookItems(items: BookListItem[], { query, status, category, language }: BookFilters): BookListItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(({ book, openLoan }) => {
    // Deleted (archived) books are hidden everywhere except the Archived filter (ADR-0009)
    if (status === 'archived' ? !book.archived : book.archived) return false
    if (status === 'available' && openLoan) return false
    if (status === 'borrowed' && !openLoan) return false
    if (category && !(book.categories ?? []).some((name) => sameName(name, category))) return false
    if (language && !(book.language && sameName(book.language, language))) return false
    const haystack = `${book.title} ${book.author} ${book.id}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

export const UNCATEGORIZED = 'Uncategorized'

export interface BookGroup {
  name: string
  items: BookListItem[]
}

/**
 * One group per active category (A to Z, as given), each holding its books in the order they arrive; books in none of
 * the active categories go last under "Uncategorized". A book in two categories appears in both. Empty groups are left out.
 */
export function groupBooksByCategory(items: BookListItem[], activeCategories: readonly string[]): BookGroup[] {
  const groups: BookGroup[] = activeCategories.map((name) => ({
    name,
    items: items.filter(({ book }) => (book.categories ?? []).some((c) => sameName(c, name))),
  }))
  const uncategorized = items.filter(({ book }) => !activeCategories.some((name) => (book.categories ?? []).some((c) => sameName(c, name))))
  if (uncategorized.length > 0) groups.push({ name: UNCATEGORIZED, items: uncategorized })
  return groups.filter((group) => group.items.length > 0)
}

/** A book's category names that are still active (archived ones are kept in the Sheet but not shown). */
export function visibleCategories(book: Pick<Book, 'categories'>, activeCategories: readonly string[]): string[] {
  return (book.categories ?? []).filter((c) => activeCategories.some((name) => sameName(name, c)))
}

/** Newest loan first, by borrowed date and time (ISO strings sort correctly as text). */
export function sortLoansNewestFirst(loans: Loan[]): Loan[] {
  const key = (loan: Loan) => `${loan.borrowedDate} ${loan.borrowedTime}`
  return [...loans].sort((a, b) => key(b).localeCompare(key(a)))
}
