import { createSlice } from '@reduxjs/toolkit'
import { loadAll } from '@/store/libraryThunks'
import { signOut } from '@/store/sessionSlice'

export interface LibraryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  /** Epoch ms of the last successful load. */
  loadedAt: number | null
  /** Why deleting a book is not possible yet (the Books tab has no `Active` column). Absent = it is. */
  archiveSetup?: string
}

const initialState: LibraryState = { status: 'idle', error: null, loadedAt: null }

/** Load status only; the data itself lives in the books and borrowers slices. */
const librarySlice = createSlice({
  name: 'library',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(signOut.fulfilled, () => initialState)
      .addCase(loadAll.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loadAll.fulfilled, (state, { payload }) => {
        state.status = 'ready'
        state.loadedAt = Date.now()
        state.archiveSetup = payload.archiveSetup
      })
      .addCase(loadAll.rejected, (state, { error }) => {
        state.status = 'error'
        state.error = error.message ?? 'Could not load the library.'
      })
  },
})

export default librarySlice.reducer
