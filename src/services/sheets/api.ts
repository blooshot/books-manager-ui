import { formatDate, formatTime } from '@/lib/datetime'
import type { Book, Loan } from '@/types/library'
import type { SheetsClient } from '@/services/sheets/client'
import {
  AlreadyBorrowedError,
  BookNotFoundError,
  NotBorrowedError,
  ValidationError,
} from '@/services/sheets/errors'
import { nextBookId } from '@/services/sheets/ids'
import {
  BOOKS_TAB,
  BORROWERS_TAB,
  bookCells,
  buildRow,
  cellAddress,
  escapeText,
  loanCells,
  loanKey,
  parseBooks,
  parseLoans,
  type Cell,
  type ParsedRow,
} from '@/services/sheets/mapping'

/**
 * Domain operations on the two tabs. Every write re-reads the tab first and
 * locates rows by Book ID, so hand-edits (sorting, inserting rows) made since
 * the app loaded can't make it touch the wrong row.
 * Books are append-only (ADR-0004): there is no delete/clear here, by design.
 */

/**
 * `idempotent`: this call may be a retry of one that already succeeded (the network dropped the response),
 * so if the write is already in the Sheet, return it instead of writing it again. Used only by the outbox.
 */
export interface WriteOptions {
  idempotent?: boolean
}

export interface LibraryData {
  books: Book[]
  loans: Loan[]
}

export async function readAll(client: SheetsClient): Promise<LibraryData> {
  const [booksValues, loansValues] = await client.batchGet([BOOKS_TAB, BORROWERS_TAB])
  return {
    books: parseBooks(booksValues).rows.map((r) => r.value),
    loans: parseLoans(loansValues).rows.map((r) => r.value),
  }
}

export interface NewBookInput {
  title: string
  author: string
  purchaseDate?: string
  pricePaid?: number
  marketPrice?: number
  photoUrl?: string
}

function requireText(value: string | undefined, label: string): string {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') throw new ValidationError(`${label} is required.`)
  return trimmed
}

/**
 * Assigns the next Book ID from a fresh read, then appends the row.
 *
 * `beforeAppend` runs after the ID is chosen and before the row is written, and may return the
 * Photo link to store. It exists because a cover file is named after the Book ID (ADR-0007) and the
 * upload must come first, so a row never exists without its photo. If it throws, nothing is written;
 * if the append fails afterwards, the uploaded file is left behind as a harmless orphan.
 */
export async function appendBook(
  client: SheetsClient,
  input: NewBookInput,
  now: Date = new Date(),
  beforeAppend?: (bookId: string) => Promise<string | undefined>,
  options: WriteOptions = {},
): Promise<Book> {
  const title = requireText(input.title, 'Title')
  const author = requireText(input.author, 'Author')
  const [values] = await client.batchGet([BOOKS_TAB])
  const table = parseBooks(values)
  if (options.idempotent) {
    // A retry of a write that may already have gone through (e.g. the response was lost): `Added at` is the key.
    const already = table.rows.find((r) => r.value.addedAt === now.toISOString() && r.value.title === title)
    if (already) return already.value
  }
  const id = nextBookId(table.rows.map((r) => r.value.id))
  const uploadedPhotoUrl = beforeAppend ? await beforeAppend(id) : undefined
  const book: Book = {
    id,
    title,
    author,
    purchaseDate: input.purchaseDate || undefined,
    pricePaid: input.pricePaid,
    marketPrice: input.marketPrice,
    photoUrl: uploadedPhotoUrl ?? (input.photoUrl || undefined),
    addedAt: now.toISOString(),
  }
  await client.append(BOOKS_TAB, buildRow(table.columns, table.width, bookCells(book)))
  return book
}

/** Editable book fields. `null` clears the cell; a missing key leaves it untouched. */
export interface BookPatch {
  title?: string
  author?: string
  purchaseDate?: string | null
  pricePaid?: number | null
  marketPrice?: number | null
  photoUrl?: string | null
}

/** Writes only the changed cells, so columns the app doesn't know about are never overwritten. */
export async function updateBook(client: SheetsClient, bookId: string, patch: BookPatch): Promise<Book> {
  const [values] = await client.batchGet([BOOKS_TAB])
  const table = parseBooks(values)
  const found = table.rows.find((r) => r.value.id === bookId)
  if (!found) throw new BookNotFoundError(bookId)

  const merged: Book = { ...found.value }
  const updates: { range: string; value: Cell }[] = []
  const set = <K extends keyof BookPatch>(field: K, cellValue: Cell, apply: () => void) => {
    if (patch[field] === undefined) return
    apply()
    updates.push({ range: cellAddress(BOOKS_TAB, table.columns[field], found.row), value: cellValue })
  }

  if (patch.title !== undefined) {
    const title = requireText(patch.title, 'Title')
    set('title', escapeText(title), () => (merged.title = title))
  }
  if (patch.author !== undefined) {
    const author = requireText(patch.author, 'Author')
    set('author', escapeText(author), () => (merged.author = author))
  }
  set('purchaseDate', patch.purchaseDate ?? '', () => (merged.purchaseDate = patch.purchaseDate || undefined))
  set('pricePaid', patch.pricePaid ?? '', () => (merged.pricePaid = patch.pricePaid ?? undefined))
  set('marketPrice', patch.marketPrice ?? '', () => (merged.marketPrice = patch.marketPrice ?? undefined))
  set('photoUrl', patch.photoUrl ? escapeText(patch.photoUrl) : '', () => (merged.photoUrl = patch.photoUrl || undefined))

  if (updates.length > 0) await client.batchUpdate(updates)
  return merged
}

export interface NewLoanInput {
  bookId: string
  borrowerName: string
  place: string
  /** Defaults to now. */
  borrowedDate?: string
  borrowedTime?: string
}

/** Row number from an append response such as "Borrowers!A7:H7". */
function rowFromRange(range: string | undefined): number | undefined {
  const match = range ? /!\$?[A-Z]+(\d+)/.exec(range) : null
  return match ? Number(match[1]) : undefined
}

export async function appendLoan(client: SheetsClient, input: NewLoanInput, now: Date = new Date(), options: WriteOptions = {}): Promise<Loan> {
  const borrowerName = requireText(input.borrowerName, 'Borrower name')
  const [booksValues, loansValues] = await client.batchGet([BOOKS_TAB, BORROWERS_TAB])
  const books = parseBooks(booksValues)
  const loans = parseLoans(loansValues)

  if (!books.rows.some((r) => r.value.id === input.bookId)) throw new BookNotFoundError(input.bookId)
  if (options.idempotent && input.borrowedDate && input.borrowedTime) {
    const already = loans.rows.find(
      (r) =>
        r.value.bookId === input.bookId &&
        r.value.borrowerName === borrowerName &&
        r.value.borrowedDate === input.borrowedDate &&
        r.value.borrowedTime === input.borrowedTime,
    )
    if (already) return already.value
  }
  const open = loans.rows.find((r) => r.value.bookId === input.bookId && !r.value.returnedDate)
  if (open) throw new AlreadyBorrowedError(input.bookId, open.value.borrowerName)

  const loan: Omit<Loan, 'key'> = {
    bookId: input.bookId,
    borrowerName,
    borrowedDate: input.borrowedDate ?? formatDate(now),
    borrowedTime: input.borrowedTime ?? formatTime(now),
    place: input.place.trim(),
    returned: false,
  }
  const { updatedRange } = await client.append(BORROWERS_TAB, buildRow(loans.columns, loans.width, loanCells(loan)))
  const row = rowFromRange(updatedRange) ?? loans.rows.length + 2
  return { ...loan, key: loanKey(loan.bookId, row) }
}

export interface ReturnInput {
  bookId: string
  /** Default to now. */
  returnedDate?: string
  returnedTime?: string
}

/** Marks the book's open loan as returned (Returned = Yes plus date and time). */
export async function returnLoan(client: SheetsClient, input: ReturnInput, now: Date = new Date(), options: WriteOptions = {}): Promise<Loan> {
  const [values] = await client.batchGet([BORROWERS_TAB])
  const table = parseLoans(values)
  const open: ParsedRow<Loan>[] = table.rows.filter((r) => r.value.bookId === input.bookId && !r.value.returnedDate)
  // Normally at most one; if hand-edits left several, close the most recent.
  const target = open.at(-1)
  if (!target) {
    if (options.idempotent && input.returnedDate && input.returnedTime) {
      const already = table.rows
        .filter((r) => r.value.bookId === input.bookId && r.value.returnedDate === input.returnedDate && r.value.returnedTime === input.returnedTime)
        .at(-1)
      if (already) return already.value
    }
    throw new NotBorrowedError(input.bookId)
  }

  const returnedDate = input.returnedDate ?? formatDate(now)
  const returnedTime = input.returnedTime ?? formatTime(now)
  const at = (field: 'returned' | 'returnedDate' | 'returnedTime') =>
    cellAddress(BORROWERS_TAB, table.columns[field], target.row)
  await client.batchUpdate([
    { range: at('returned'), value: 'Yes' },
    { range: at('returnedDate'), value: returnedDate },
    { range: at('returnedTime'), value: returnedTime },
  ])
  return { ...target.value, returned: true, returnedDate, returnedTime }
}
