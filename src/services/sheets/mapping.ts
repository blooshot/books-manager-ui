import type { Book, ListOption, Loan } from '@/types/library'
import { SheetSchemaError } from '@/services/sheets/errors'

/**
 * Pure conversion between Sheet rows and app types.
 * Columns are found by header name (never by position) so the owner can
 * reorder or add columns by hand. Rows are identified by Book ID, never row index.
 */

export const BOOKS_TAB = 'Books'
export const BORROWERS_TAB = 'Borrowers'
export const CATEGORIES_TAB = 'Categories'
export const LANGUAGES_TAB = 'Languages'

export type Cell = string | number

export const BOOK_COLUMNS = {
  id: 'Book ID',
  title: 'Title',
  author: 'Author',
  purchaseDate: 'Purchase date',
  pricePaid: 'Price paid',
  marketPrice: 'Current market price',
  photoUrl: 'Photo',
  addedAt: 'Added at',
  categories: 'Categories',
  language: 'Language',
  archived: 'Active',
} as const satisfies Record<keyof Book, string>

/**
 * Columns an older Sheet may not have yet. A missing one reads as empty and the app says how to add it; only
 * *writing* a value to a missing column is an error (it would otherwise be lost silently).
 */
export const OPTIONAL_BOOK_FIELDS = ['categories', 'language', 'archived'] as const satisfies readonly (keyof typeof BOOK_COLUMNS)[]

export const OPTION_COLUMNS = { name: 'Name', active: 'Active' } as const satisfies Record<keyof ListOption, string>
export type OptionField = keyof typeof OPTION_COLUMNS

export const LOAN_COLUMNS = {
  bookId: 'Book ID',
  borrowerName: 'Borrower name',
  borrowedDate: 'Borrowed date',
  borrowedTime: 'Borrowed time',
  place: 'Place',
  returned: 'Returned',
  returnedDate: 'Returned date',
  returnedTime: 'Returned time',
} as const satisfies Record<keyof Omit<Loan, 'key'>, string>

export type BookField = keyof typeof BOOK_COLUMNS
export type LoanField = keyof typeof LOAN_COLUMNS

/** Field -> 0-based column index in the sheet. */
export type ColumnMap<F extends string> = Record<F, number>

export interface Table<T, F extends string> {
  columns: ColumnMap<F>
  /** Number of header cells; new rows are padded to this width. */
  width: number
  rows: ParsedRow<T>[]
}

export interface ParsedRow<T> {
  /** 1-based sheet row number as of this read. Only valid until the next write. */
  row: number
  value: T
}

const norm = (s: string) => s.trim().toLowerCase()

/** Finds every spec column in the header row. Missing columns raise SheetSchemaError, except `optional` ones (index -1). */
export function resolveColumns<F extends string>(
  tab: string,
  headerRow: readonly string[] | undefined,
  spec: Record<F, string>,
  optional: readonly F[] = [],
): { columns: ColumnMap<F>; width: number } {
  const header = (headerRow ?? []).map((h) => norm(String(h ?? '')))
  const columns = {} as ColumnMap<F>
  const missing: string[] = []
  for (const field of Object.keys(spec) as F[]) {
    const index = header.indexOf(norm(spec[field]))
    if (index === -1 && !optional.includes(field)) missing.push(spec[field])
    columns[field] = index
  }
  if (missing.length > 0) throw new SheetSchemaError(tab, missing)
  return { columns, width: header.length }
}

const cell = (row: readonly unknown[], index: number): string => String(row[index] ?? '').trim()

/** "₹1,299.50" -> 1299.5. Empty or unparseable -> undefined. Assumes '.' as the decimal mark. */
export function parseNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/[^0-9.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

const optional = (s: string): string | undefined => (s === '' ? undefined : s)

/** "Self-help, Business" -> ['Self-help', 'Business'] (trimmed, no blanks, no repeats). */
export function parseNameList(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of text.split(',')) {
    const name = part.trim()
    if (name !== '' && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      names.push(name)
    }
  }
  return names
}

export const joinNameList = (names: readonly string[]): string => parseNameList(names.join(',')).join(', ')

/** A row is active unless its Active cell says No: hand-typed rows without the cell count as active. */
const isNo = (s: string) => /^(no|n|false)$/i.test(s)

export function parseBooks(values: readonly (readonly unknown[])[] | undefined): Table<Book, BookField> {
  const [header, ...body] = values ?? []
  const { columns, width } = resolveColumns<BookField>(BOOKS_TAB, header as string[] | undefined, BOOK_COLUMNS, OPTIONAL_BOOK_FIELDS)
  const rows: ParsedRow<Book>[] = []
  body.forEach((row, i) => {
    const id = cell(row, columns.id)
    if (id === '') return // blank or half-typed row
    const categories = parseNameList(cell(row, columns.categories))
    rows.push({
      row: i + 2,
      value: {
        id,
        title: cell(row, columns.title),
        author: cell(row, columns.author),
        purchaseDate: optional(cell(row, columns.purchaseDate)),
        pricePaid: parseNumber(cell(row, columns.pricePaid)),
        marketPrice: parseNumber(cell(row, columns.marketPrice)),
        photoUrl: optional(cell(row, columns.photoUrl)),
        addedAt: optional(cell(row, columns.addedAt)),
        categories: categories.length > 0 ? categories : undefined,
        language: optional(cell(row, columns.language)),
        archived: isNo(cell(row, columns.archived)) || undefined,
      },
    })
  })
  return { columns, width, rows }
}

export function parseOptions(tab: string, values: readonly (readonly unknown[])[] | undefined): Table<ListOption, OptionField> {
  const [header, ...body] = values ?? []
  const { columns, width } = resolveColumns(tab, header as string[] | undefined, OPTION_COLUMNS)
  const rows: ParsedRow<ListOption>[] = []
  body.forEach((row, i) => {
    const name = cell(row, columns.name)
    if (name === '') return
    rows.push({ row: i + 2, value: { name, active: !isNo(cell(row, columns.active)) } })
  })
  return { columns, width, rows }
}

export const optionCells = (option: ListOption): Record<OptionField, Cell> => ({
  name: escapeText(option.name),
  active: option.active ? 'Yes' : 'No',
})

const isYes = (s: string) => /^(yes|y|true)$/i.test(s)

export function parseLoans(values: readonly (readonly unknown[])[] | undefined): Table<Loan, LoanField> {
  const [header, ...body] = values ?? []
  const { columns, width } = resolveColumns(BORROWERS_TAB, header as string[] | undefined, LOAN_COLUMNS)
  const rows: ParsedRow<Loan>[] = []
  body.forEach((row, i) => {
    const bookId = cell(row, columns.bookId)
    if (bookId === '') return
    const rowNumber = i + 2
    rows.push({
      row: rowNumber,
      value: {
        key: loanKey(bookId, rowNumber),
        bookId,
        borrowerName: cell(row, columns.borrowerName),
        borrowedDate: cell(row, columns.borrowedDate),
        borrowedTime: cell(row, columns.borrowedTime),
        place: cell(row, columns.place),
        returned: isYes(cell(row, columns.returned)),
        returnedDate: optional(cell(row, columns.returnedDate)),
        returnedTime: optional(cell(row, columns.returnedTime)),
      },
    })
  })
  return { columns, width, rows }
}

export const loanKey = (bookId: string, row: number) => `${bookId}|${row}`

/**
 * Text written with USER_ENTERED is parsed like typing into the Sheet, so a value
 * starting with = + - @ would become a formula. A leading apostrophe forces plain text
 * (Sheets hides it and it is not returned when reading).
 */
export function escapeText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnLetter(index: number): string {
  let n = index + 1
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

export const cellAddress = (tab: string, column: number, row: number) =>
  `${tab}!${columnLetter(column)}${row}`

/** Builds a full new row, padded to the header width; unspecified columns stay empty. */
export function buildRow<F extends string>(
  columns: ColumnMap<F>,
  width: number,
  cells: Partial<Record<F, Cell>>,
): Cell[] {
  const size = Math.max(width, ...Object.values<number>(columns).map((i) => i + 1))
  const row: Cell[] = Array.from({ length: size }, () => '')
  for (const field of Object.keys(cells) as F[]) {
    if (columns[field] >= 0) row[columns[field]] = cells[field] ?? '' // -1: an optional column this Sheet doesn't have
  }
  return row
}

/**
 * A leading apostrophe stores the value as plain text. `Added at` needs this: written as-is, Sheets parses an ISO
 * datetime into a date value and reads it back in the cell's display format, so it would never equal what was
 * written. The outbox uses `Added at` as the key that stops a retried add from appending the same book twice.
 */
const forceText = (s: string): Cell => `'${s}`

const num = (n: number | undefined): Cell => (n === undefined || !Number.isFinite(n) ? '' : n)
const str = (s: string | undefined): Cell => (s === undefined ? '' : escapeText(s))

export function bookCells(book: Book): Record<BookField, Cell> {
  return {
    id: book.id,
    title: str(book.title),
    author: str(book.author),
    purchaseDate: book.purchaseDate ?? '',
    pricePaid: num(book.pricePaid),
    marketPrice: num(book.marketPrice),
    photoUrl: str(book.photoUrl),
    addedAt: book.addedAt ? forceText(book.addedAt) : '',
    categories: book.categories?.length ? escapeText(joinNameList(book.categories)) : '',
    language: str(book.language),
    archived: book.archived ? 'No' : '',
  }
}

export function loanCells(loan: Omit<Loan, 'key'>): Record<LoanField, Cell> {
  return {
    bookId: loan.bookId,
    borrowerName: str(loan.borrowerName),
    borrowedDate: loan.borrowedDate,
    borrowedTime: loan.borrowedTime,
    place: str(loan.place),
    returned: loan.returned ? 'Yes' : 'No',
    returnedDate: loan.returnedDate ?? '',
    returnedTime: loan.returnedTime ?? '',
  }
}
