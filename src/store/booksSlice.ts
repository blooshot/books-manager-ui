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
    /** Insert or replace a whole book (used to reconcile optimistic updates and roll them back). */
    bookSet: booksAdapter.setOne,
  },
})

export const { booksLoaded, bookAdded, bookUpdated, bookSet } = booksSlice.actions
export default booksSlice.reducer
