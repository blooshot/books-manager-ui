import { createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Book } from '@/types/library'

/** Books are append-only (ADR-0004): there is deliberately no remove action here. */
export const booksAdapter = createEntityAdapter<Book>({
  sortComparer: (a, b) => a.id.localeCompare(b.id),
})

const booksSlice = createSlice({
  name: 'books',
  initialState: booksAdapter.getInitialState(),
  reducers: {
    booksLoaded(state, action: PayloadAction<Book[]>) {
      booksAdapter.setAll(state, action.payload)
    },
    bookAdded: booksAdapter.addOne,
    bookUpdated: booksAdapter.updateOne,
  },
})

export const { booksLoaded, bookAdded, bookUpdated } = booksSlice.actions
export default booksSlice.reducer
