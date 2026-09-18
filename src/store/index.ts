import { configureStore } from '@reduxjs/toolkit'
import { config } from '@/lib/config'
import booksReducer from '@/store/booksSlice'
import borrowersReducer from '@/store/borrowersSlice'
import libraryReducer from '@/store/librarySlice'
import noticesReducer from '@/store/noticesSlice'
import type { ThunkExtra } from '@/store/libraryThunks'
import sessionReducer from '@/store/sessionSlice'

const defaultExtra: ThunkExtra = {
  sheetId: config.sheetId,
  now: () => new Date(),
}

/** `extra` is injectable so tests can point the thunks at a fake Sheet. */
export const makeStore = (extra: ThunkExtra = defaultExtra) =>
  configureStore({
    reducer: {
      session: sessionReducer,
      library: libraryReducer,
      notices: noticesReducer,
      books: booksReducer,
      borrowers: borrowersReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ thunk: { extraArgument: extra } }),
  })

export const store = makeStore()

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
