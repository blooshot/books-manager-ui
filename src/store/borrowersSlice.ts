import { createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit'
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
  },
})

export const { loansLoaded, loanAdded, loanUpdated } = borrowersSlice.actions
export default borrowersSlice.reducer
