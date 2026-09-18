import type { OutboxEntry, OutboxOp } from '@/services/outbox/types'
import type { Book, Loan } from '@/types/library'

/** Key of the temporary loan shown for a queued borrow (the same one the optimistic borrow uses). */
export const pendingLoanKey = (bookId: string) => `pending|${bookId}`

/**
 * Shows queued changes on top of freshly loaded data, so a refresh or reload never makes a pending change
 * disappear from the screen while it is still waiting to be sent. Pure: returns new arrays.
 * Only `pending` entries apply; `failed` ones were found not to fit the Sheet and are shown in the pending list.
 * A queued *add* has no Book ID yet, so it appears only in that list, not among the books.
 */
export function applyPending(books: Book[], loans: Loan[], entries: OutboxEntry[]): { books: Book[]; loans: Loan[] } {
  const nextBooks = books.map((book) => ({ ...book }))
  let nextLoans = loans.map((loan) => ({ ...loan }))
  const byId = new Map(nextBooks.map((book) => [book.id, book]))
  const openLoanOf = (bookId: string) => nextLoans.find((loan) => loan.bookId === bookId && !loan.returnedDate)

  for (const entry of [...entries].sort((a, b) => a.seq - b.seq)) {
    if (entry.status !== 'pending') continue
    const { op } = entry
    if (op.kind === 'editBook') {
      const book = byId.get(op.bookId)
      if (!book) continue
      for (const [field, value] of Object.entries(op.patch)) {
        ;(book as unknown as Record<string, unknown>)[field] = value ?? undefined // null clears the field
      }
    } else if (op.kind === 'borrow') {
      if (!byId.has(op.input.bookId) || openLoanOf(op.input.bookId)) continue
      nextLoans = [
        ...nextLoans,
        {
          key: pendingLoanKey(op.input.bookId),
          bookId: op.input.bookId,
          borrowerName: op.input.borrowerName,
          borrowedDate: op.input.borrowedDate,
          borrowedTime: op.input.borrowedTime,
          place: op.input.place,
          returned: false,
        },
      ]
    } else if (op.kind === 'return') {
      const loan = openLoanOf(op.bookId)
      if (loan) Object.assign(loan, { returned: true, returnedDate: op.returnedDate, returnedTime: op.returnedTime })
    }
  }
  return { books: nextBooks, loans: nextLoans }
}

const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  author: 'author',
  purchaseDate: 'purchase date',
  pricePaid: 'price paid',
  marketPrice: 'market price',
  photoUrl: 'photo',
  categories: 'categories',
  language: 'language',
}

/** One line for the pending list, e.g. `Lend “Dune” to Ravi`. `titleOf` looks up a book's title by ID. */
export function describeOp(op: OutboxOp, titleOf: (bookId: string) => string | undefined): string {
  const quoted = (bookId: string) => `“${titleOf(bookId) ?? bookId}”`
  switch (op.kind) {
    case 'addBook':
      return `Add “${op.input.title}” by ${op.input.author}${op.hasPhoto ? ' (with cover photo)' : ''}`
    case 'editBook': {
      const fields = Object.keys(op.patch).map((field) => FIELD_LABELS[field] ?? field)
      if (op.hasPhoto) fields.push('cover photo')
      return `Edit ${quoted(op.bookId)}${fields.length > 0 ? ` (${fields.join(', ')})` : ''}`
    }
    case 'borrow':
      return `Lend ${quoted(op.input.bookId)} to ${op.input.borrowerName}`
    case 'return':
      return `Mark ${quoted(op.bookId)} as returned`
  }
}
