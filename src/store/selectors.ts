import { createSelector } from '@reduxjs/toolkit'
import { booksAdapter } from '@/store/booksSlice'
import { loansAdapter } from '@/store/borrowersSlice'
import type { RootState } from '@/store'
import type { Book, Loan } from '@/types/library'

export const booksSelectors = booksAdapter.getSelectors((state: RootState) => state.books)
export const loansSelectors = loansAdapter.getSelectors((state: RootState) => state.borrowers)

/** A loan is open until it has a returned date (the date wins over the Yes/No column). */
export const isOpenLoan = (loan: Loan): boolean => !loan.returnedDate

/** Open loan per book id. A book with no entry is available. */
export const selectOpenLoanByBookId = createSelector([loansSelectors.selectAll], (loans) => {
  const byBook = new Map<string, Loan>()
  for (const loan of loans) {
    if (isOpenLoan(loan)) byBook.set(loan.bookId, loan)
  }
  return byBook
})

export interface LentOutGroup {
  borrowerName: string
  items: { book: Book; loan: Loan }[]
}

/** Borrower -> books they currently hold, oldest loans first (Lent out screen). */
export const selectLentOutByBorrower = createSelector(
  [booksSelectors.selectEntities, selectOpenLoanByBookId],
  (booksById, openLoans): LentOutGroup[] => {
    const groups = new Map<string, LentOutGroup>()
    for (const loan of openLoans.values()) {
      const book = booksById[loan.bookId]
      if (!book) continue // loan for an unknown Book ID: nothing to show
      const group = groups.get(loan.borrowerName) ?? { borrowerName: loan.borrowerName, items: [] }
      group.items.push({ book, loan })
      groups.set(loan.borrowerName, group)
    }
    const sortKey = (l: Loan) => `${l.borrowedDate} ${l.borrowedTime}`
    for (const group of groups.values()) {
      group.items.sort((a, b) => sortKey(a.loan).localeCompare(sortKey(b.loan)))
    }
    return [...groups.values()].sort((a, b) => a.borrowerName.localeCompare(b.borrowerName))
  },
)

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

/** Names offered in pickers and filters: active entries, A to Z. Archived ones are hidden but kept in the Sheet. */
export const selectActiveCategories = createSelector([(state: RootState) => state.taxonomy.categories], (options) =>
  options.filter((o) => o.active).map((o) => o.name).sort(byName),
)
export const selectActiveLanguages = createSelector([(state: RootState) => state.taxonomy.languages], (options) =>
  options.filter((o) => o.active).map((o) => o.name).sort(byName),
)
