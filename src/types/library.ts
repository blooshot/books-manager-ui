/** One row of the `Books` tab. Optional fields are empty cells. */
export interface Book {
  /** `B-0001` style; app-assigned, never edited. */
  id: string
  title: string
  author: string
  purchaseDate?: string // yyyy-mm-dd
  pricePaid?: number
  marketPrice?: number
  /** Google Drive file link; empty means placeholder cover. */
  photoUrl?: string
  addedAt?: string // ISO timestamp
  /** Category names (a book can be in several). Text, so archiving a category never changes a book. */
  categories?: string[]
  /** One language name. */
  language?: string
  /** "Deleted" in the app: the `Active` cell says No. The row stays; the book is hidden and can be restored (ADR-0009). */
  archived?: boolean
}

/** One row of the `Categories` or `Languages` tab. Archived ones are hidden from pickers and filters, never removed. */
export interface ListOption {
  name: string
  active: boolean
}

/** The two managed lists, each with its own tab. */
export type OptionList = 'categories' | 'languages'

/** One row of the `Borrowers` tab: a single loan. */
export interface Loan {
  /** Identity within the store (`<bookId>|<sheet row at load>`); not a Sheet column. */
  key: string
  bookId: string
  borrowerName: string
  borrowedDate: string // yyyy-mm-dd
  borrowedTime: string // HH:mm
  place: string
  /** Mirrors the sheet's Yes/No column; `returnedDate` is what decides status. */
  returned: boolean
  returnedDate?: string
  returnedTime?: string
}
