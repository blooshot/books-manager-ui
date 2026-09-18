import { configureStore } from '@reduxjs/toolkit'
import booksReducer from '@/store/booksSlice'
import borrowersReducer from '@/store/borrowersSlice'
import sessionReducer from '@/store/sessionSlice'

export const makeStore = () =>
  configureStore({
    reducer: {
      session: sessionReducer,
      books: booksReducer,
      borrowers: borrowersReducer,
    },
  })

export const store = makeStore()

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
