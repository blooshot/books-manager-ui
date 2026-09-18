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
]

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
