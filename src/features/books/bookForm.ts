import { isRealIsoDate } from '@/lib/datetime'
import type { BookPatch, NewBookInput } from '@/services/sheets/api'
import type { Book } from '@/types/library'

/** The add/edit form's fields, all as the text the user typed. */
export interface BookFormValues {
  title: string
  author: string
  purchaseDate: string
  pricePaid: string
  marketPrice: string
  /** All the book's category names, including archived ones the form doesn't show: saving must not drop them. */
  categories: string[]
  language: string
}

export const EMPTY_BOOK_FORM: BookFormValues = { title: '', author: '', purchaseDate: '', pricePaid: '', marketPrice: '', categories: [], language: '' }

/** The text fields of the form (everything but `categories`). */
export type BookFormTextField = Exclude<keyof BookFormValues, 'categories'>

export type BookFormErrors = Partial<Record<BookFormTextField, string>>

/** "1,299.50" -> 1299.5; empty -> undefined; anything else (letters, negatives, 3 decimals) -> 'invalid'. */
export function parseAmount(text: string): number | undefined | 'invalid' {
  const cleaned = text.trim().replace(/,/g, '')
  if (cleaned === '') return undefined
  return /^\d+(\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : 'invalid'
}

export function validateBookForm(values: BookFormValues): BookFormErrors {
  const errors: BookFormErrors = {}
  if (values.title.trim() === '') errors.title = 'Title is required.'
  if (values.author.trim() === '') errors.author = 'Author is required.'
  const date = values.purchaseDate.trim()
  if (date !== '' && !isRealIsoDate(date)) errors.purchaseDate = 'Enter a valid date as yyyy-mm-dd.'
  if (parseAmount(values.pricePaid) === 'invalid') errors.pricePaid = 'Enter an amount such as 1299.50.'
  if (parseAmount(values.marketPrice) === 'invalid') errors.marketPrice = 'Enter an amount such as 1299.50.'
  return errors
}

const amount = (text: string): number | undefined => {
  const parsed = parseAmount(text)
  return parsed === 'invalid' ? undefined : parsed
}

/** Values for a valid form, ready for `addBook`. */
export function toNewBookInput(values: BookFormValues): NewBookInput {
  return {
    title: values.title.trim(),
    author: values.author.trim(),
    purchaseDate: values.purchaseDate.trim() || undefined,
    pricePaid: amount(values.pricePaid),
    marketPrice: amount(values.marketPrice),
    categories: values.categories.length > 0 ? values.categories : undefined,
    language: values.language.trim() || undefined,
  }
}

export function valuesFromBook(book: Book): BookFormValues {
  return {
    title: book.title,
    author: book.author,
    purchaseDate: book.purchaseDate ?? '',
    pricePaid: book.pricePaid === undefined ? '' : String(book.pricePaid),
    marketPrice: book.marketPrice === undefined ? '' : String(book.marketPrice),
    categories: book.categories ?? [],
    language: book.language ?? '',
  }
}

/** Same names, ignoring order and case. */
export function sameCategories(a: readonly string[], b: readonly string[]): boolean {
  const key = (names: readonly string[]) => names.map((n) => n.trim().toLowerCase()).sort().join('\u0000')
  return key(a) === key(b)
}

/** Only the fields that differ from the saved book; an emptied optional field becomes `null` (clear the cell). */
export function toBookPatch(values: BookFormValues, book: Book): BookPatch {
  const patch: BookPatch = {}
  const next = toNewBookInput(values)
  if (next.title !== book.title) patch.title = next.title
  if (next.author !== book.author) patch.author = next.author
  if (next.purchaseDate !== book.purchaseDate) patch.purchaseDate = next.purchaseDate ?? null
  if (next.pricePaid !== book.pricePaid) patch.pricePaid = next.pricePaid ?? null
  if (next.marketPrice !== book.marketPrice) patch.marketPrice = next.marketPrice ?? null
  if (!sameCategories(next.categories ?? [], book.categories ?? [])) patch.categories = next.categories ?? null
  if (next.language !== book.language) patch.language = next.language ?? null
  return patch
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** An existing book with the same title and author (ignoring case and spacing), if any. Deleted books do not count. */
export function findDuplicate(books: Book[], title: string, author: string, excludeId?: string): Book | undefined {
  if (title.trim() === '' || author.trim() === '') return undefined
  return books.find((book) => !book.archived && book.id !== excludeId && same(book.title, title) && same(book.author, author))
}
