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
}

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
