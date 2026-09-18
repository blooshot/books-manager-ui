import { createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { signOut } from '@/store/sessionSlice'
import type { Loan } from '@/types/library'

export const loansAdapter = createEntityAdapter<Loan, string>({
  selectId: (loan) => loan.key,
})

const borrowersSlice = createSlice({
  name: 'borrowers',
  initialState: loansAdapter.getInitialState(),
  reducers: {
    loansLoaded(state, action: PayloadAction<Loan[]>) {
      loansAdapter.setAll(state, action.payload)
    },
    loanAdded: loansAdapter.addOne,
    loanUpdated: loansAdapter.updateOne,
    /** Insert or replace a whole loan (reconcile / roll back optimistic changes). */
    loanSet: loansAdapter.setOne,
    /** Drops a local, not-yet-confirmed loan row from the store. Never touches the Sheet. */
    loanDiscarded: loansAdapter.removeOne,
  },
  // Signing out leaves nothing of the library in memory
  extraReducers: (builder) => {
    builder.addCase(signOut.fulfilled, () => loansAdapter.getInitialState())
  },
})

export const { loansLoaded, loanAdded, loanUpdated, loanSet, loanDiscarded } = borrowersSlice.actions
export default borrowersSlice.reducer
