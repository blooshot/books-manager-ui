/** Sheet rows in the column order of the fakes' header rows (see fakeSheets.ts). */
export interface BookRowInput {
  id: string
  title: string
  author: string
  purchaseDate?: string
  pricePaid?: number | string
  marketPrice?: number | string
  photo?: string
  addedAt?: string
  categories?: string
  language?: string
  /** A deleted (archived) book: the Active cell says No. */
  archived?: boolean
}

export const bookRow = (b: BookRowInput): string[] => [
  b.id,
  b.title,
  b.author,
  b.purchaseDate ?? '',
  String(b.pricePaid ?? ''),
  String(b.marketPrice ?? ''),
  b.photo ?? '',
  b.addedAt ?? '',
  b.categories ?? '',
  b.language ?? '',
  b.archived ? 'No' : '',
]

/** A row for the Categories or Languages tab. */
export const optionRow = (name: string, active = true): string[] => [name, active ? 'Yes' : 'No']

export interface LoanRowInput {
  bookId: string
  borrower: string
  date?: string
  time?: string
  place?: string
  returnedDate?: string
  returnedTime?: string
}

export const loanRow = (l: LoanRowInput): string[] => [
  l.bookId,
  l.borrower,
  l.date ?? '2026-02-01',
  l.time ?? '10:30',
  l.place ?? 'Home',
  l.returnedDate ? 'Yes' : 'No',
  l.returnedDate ?? '',
  l.returnedTime ?? '',
]
