import { formatDate, formatTime } from '@/lib/datetime'
import type { Book, ListOption, Loan, OptionList } from '@/types/library'
import type { SheetsClient } from '@/services/sheets/client'
import {
  AlreadyBorrowedError,
  BookNotFoundError,
  NotBorrowedError,
  SheetSchemaError,
  SheetTabMissingError,
  ValidationError,
} from '@/services/sheets/errors'
import { nextBookId } from '@/services/sheets/ids'
import {
  BOOK_COLUMNS,
  BOOKS_TAB,
  BORROWERS_TAB,
  CATEGORIES_TAB,
  LANGUAGES_TAB,
  bookCells,
  buildRow,
  cellAddress,
  escapeText,
  joinNameList,
  loanCells,
  loanKey,
  optionCells,
  parseBooks,
  parseLoans,
  parseNameList,
  parseOptions,
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
  categories: ListOption[]
  languages: ListOption[]
  /** For each list that cannot be used yet, what the owner has to add to the Sheet. Absent = ready. */
  setup: Partial<Record<OptionList, string>>
}

const OPTION_TABS: Record<OptionList, string> = { categories: CATEGORIES_TAB, languages: LANGUAGES_TAB }
/** The Books column that holds each list's value. */
const OPTION_BOOK_FIELD = { categories: 'categories', languages: 'language' } as const
const OPTION_LABELS: Record<OptionList, string> = { categories: 'Category', languages: 'Language' }

/**
 * One `batchGet` of all four tabs. The `Categories` and `Languages` tabs (and the two new `Books` columns) may not
 * exist yet in an older Sheet; then the request is repeated without the missing tabs and `setup` says what to add.
 * `Books` and `Borrowers` stay required.
 */
export async function readAll(client: SheetsClient): Promise<LibraryData> {
  const missingTabs = new Set<string>()
  for (let attempt = 0; attempt < 3; attempt++) {
    const optionTabs = Object.values(OPTION_TABS).filter((tab) => !missingTabs.has(tab))
    let values: string[][][]
    try {
      values = await client.batchGet([BOOKS_TAB, BORROWERS_TAB, ...optionTabs])
    } catch (error) {
      if (error instanceof SheetTabMissingError && optionTabs.includes(error.tab)) {
        missingTabs.add(error.tab)
        continue
      }
      throw error
    }
    const books = parseBooks(values[0])
    const setup: LibraryData['setup'] = {}
    const options = {} as Record<OptionList, ListOption[]>
    for (const list of ['categories', 'languages'] as const) {
      const tab = OPTION_TABS[list]
      const position = optionTabs.indexOf(tab)
      const tabValues = position === -1 ? undefined : values[2 + position]
      options[list] = tabValues ? parseOptions(tab, tabValues).rows.map((r) => r.value) : []
      if (!tabValues) setup[list] = `Add a tab named "${tab}" with the header row Name, Active. See README > Sheet setup.`
      else if (books.columns[OPTION_BOOK_FIELD[list]] === -1) {
        setup[list] = `Add a "${BOOK_COLUMNS[OPTION_BOOK_FIELD[list]]}" column to the Books tab. See README > Sheet setup.`
      }
    }
    return {
      books: books.rows.map((r) => r.value),
      loans: parseLoans(values[1]).rows.map((r) => r.value),
      categories: options.categories,
      languages: options.languages,
      setup,
    }
  }
  throw new SheetTabMissingError(CATEGORIES_TAB)
}

export interface NewBookInput {
  title: string
  author: string
  purchaseDate?: string
  pricePaid?: number
  marketPrice?: number
  photoUrl?: string
  categories?: string[]
  language?: string
}

function requireText(value: string | undefined, label: string): string {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') throw new ValidationError(`${label} is required.`)
  return trimmed
}

/** Refuses to write a value into a Books column this Sheet doesn't have yet, since it would be lost without a word. */
function requireBookColumns(columns: { categories: number; language: number }, wants: { categories?: unknown[]; language?: unknown }): void {
  const missing: string[] = []
  if (wants.categories?.length && columns.categories === -1) missing.push(BOOK_COLUMNS.categories)
  if (wants.language && columns.language === -1) missing.push(BOOK_COLUMNS.language)
  if (missing.length > 0) throw new SheetSchemaError(BOOKS_TAB, missing)
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
  requireBookColumns(table.columns, input)
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
    categories: input.categories?.length ? parseNameList(input.categories.join(',')) : undefined,
    language: input.language?.trim() || undefined,
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
  /** An empty array or `null` clears the cell. */
  categories?: string[] | null
  language?: string | null
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
    if (table.columns[field] === -1) throw new SheetSchemaError(BOOKS_TAB, [BOOK_COLUMNS[field]])
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

  const categories = patch.categories ? parseNameList(patch.categories.join(',')) : []
  set('categories', joinNameList(categories) ? escapeText(joinNameList(categories)) : '', () => (merged.categories = categories.length > 0 ? categories : undefined))
  set('language', patch.language ? escapeText(patch.language.trim()) : '', () => (merged.language = patch.language?.trim() || undefined))

  if (updates.length > 0) await client.batchUpdate(updates)
  return merged
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function cleanOptionName(raw: string, list: OptionList): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  const label = OPTION_LABELS[list]
  if (name === '') throw new ValidationError(`${label} name is required.`)
  if (name.length > 60) throw new ValidationError(`${label} name is too long (60 characters at most).`)
  if (name.includes(',')) throw new ValidationError(`${label} names cannot contain commas.`)
  return name
}

/**
 * Adds a category or language. A name that exists but was archived is restored instead of added twice.
 * There is no delete: archiving sets Active to No (ADR-0008, on top of ADR-0004).
 */
export async function addOption(client: SheetsClient, list: OptionList, rawName: string): Promise<ListOption> {
  const name = cleanOptionName(rawName, list)
  const tab = OPTION_TABS[list]
  const [values] = await client.batchGet([tab])
  const table = parseOptions(tab, values)
  const existing = table.rows.find((r) => sameName(r.value.name, name))
  if (existing) {
    if (existing.value.active) throw new ValidationError(`${OPTION_LABELS[list]} "${existing.value.name}" already exists.`)
    await client.batchUpdate([{ range: cellAddress(tab, table.columns.active, existing.row), value: 'Yes' }])
    return { name: existing.value.name, active: true }
  }
  const option: ListOption = { name, active: true }
  await client.append(tab, buildRow(table.columns, table.width, optionCells(option)))
  return option
}

/**
 * Renames a category or language, and the same text on every book that has it, in one `values:batchUpdate`.
 * Safe to repeat: if the list row is already renamed, the books are still swept.
 */
export async function renameOption(client: SheetsClient, list: OptionList, rawFrom: string, rawTo: string): Promise<ListOption> {
  const to = cleanOptionName(rawTo, list)
  const from = rawFrom.trim()
  const tab = OPTION_TABS[list]
  const [optionValues, bookValues] = await client.batchGet([tab, BOOKS_TAB])
  const options = parseOptions(tab, optionValues)
  const books = parseBooks(bookValues)

  const fromRow = options.rows.find((r) => r.value.name === from) ?? options.rows.find((r) => sameName(r.value.name, from))
  // With no `from` row, `to` already existing means an earlier attempt renamed it: not a clash, just finish the books.
  const clash = fromRow ? options.rows.find((r) => r !== fromRow && sameName(r.value.name, to)) : undefined
  if (clash) throw new ValidationError(`${OPTION_LABELS[list]} "${clash.value.name}" already exists.`)
  if (!fromRow && !options.rows.some((r) => sameName(r.value.name, to))) {
    throw new ValidationError(`${OPTION_LABELS[list]} "${from}" was not found.`)
  }

  const updates: { range: string; value: Cell }[] = []
  if (fromRow && fromRow.value.name !== to) {
    updates.push({ range: cellAddress(tab, options.columns.name, fromRow.row), value: escapeText(to) })
  }
  const field = OPTION_BOOK_FIELD[list]
  if (books.columns[field] !== -1) {
    for (const { row, value } of books.rows) {
      if (list === 'categories') {
        const names = value.categories ?? []
        if (!names.some((n) => sameName(n, from))) continue
        const renamed = parseNameList(names.map((n) => (sameName(n, from) ? to : n)).join(','))
        if (renamed.join(', ') === names.join(', ')) continue
        updates.push({ range: cellAddress(BOOKS_TAB, books.columns.categories, row), value: escapeText(renamed.join(', ')) })
      } else if (value.language && sameName(value.language, from) && value.language !== to) {
        updates.push({ range: cellAddress(BOOKS_TAB, books.columns.language, row), value: escapeText(to) })
      }
    }
  }
  if (updates.length > 0) await client.batchUpdate(updates)
  return { name: to, active: fromRow?.value.active ?? true }
}

/** Archive (`active: false`) or restore. Nothing is deleted, and books keep their text. */
export async function setOptionActive(client: SheetsClient, list: OptionList, name: string, active: boolean): Promise<ListOption> {
  const tab = OPTION_TABS[list]
  const [values] = await client.batchGet([tab])
  const table = parseOptions(tab, values)
  const found = table.rows.find((r) => sameName(r.value.name, name))
  if (!found) throw new ValidationError(`${OPTION_LABELS[list]} "${name.trim()}" was not found.`)
  if (found.value.active !== active) {
    await client.batchUpdate([{ range: cellAddress(tab, table.columns.active, found.row), value: active ? 'Yes' : 'No' }])
  }
  return { name: found.value.name, active }
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
