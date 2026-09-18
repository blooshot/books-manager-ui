import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { signOut } from '@/store/sessionSlice'

/**
 * Non-fatal problems the user should know about but that did not fail the action
 * (e.g. an old cover could not be renamed). The UI shows them as toasts and dismisses them.
 */
export interface NoticesState {
  items: string[]
}

const noticesSlice = createSlice({
  name: 'notices',
  initialState: { items: [] } as NoticesState,
  reducers: {
    noticeAdded(state, action: PayloadAction<string>) {
      state.items.push(action.payload)
    },
    noticeDismissed(state, action: PayloadAction<number>) {
      state.items.splice(action.payload, 1)
    },
  },
  extraReducers: (builder) => {
    builder.addCase(signOut.fulfilled, () => ({ items: [] }))
  },
})

export const { noticeAdded, noticeDismissed } = noticesSlice.actions
export default noticesSlice.reducer
