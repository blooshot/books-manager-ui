import { configureStore } from '@reduxjs/toolkit'
import { config } from '@/lib/config'
import booksReducer from '@/store/booksSlice'
import borrowersReducer from '@/store/borrowersSlice'
import libraryReducer from '@/store/librarySlice'
import noticesReducer from '@/store/noticesSlice'
import { createIndexedDbOutbox } from '@/services/outbox/indexedDbOutbox'
import type { OutboxStorage } from '@/services/outbox/types'
import outboxReducer from '@/store/outboxSlice'
import type { ThunkExtra } from '@/store/thunkExtra'
import sessionReducer from '@/store/sessionSlice'
import taxonomyReducer from '@/store/taxonomySlice'

export type StoreOptions = Omit<ThunkExtra, 'outbox'> & { outbox?: OutboxStorage }

const defaultOptions: StoreOptions = {
  sheetId: config.sheetId,
  now: () => new Date(),
}

/** Options are injectable so tests can point the thunks at a fake Sheet, clock, and outbox. */
export const makeStore = (options: StoreOptions = defaultOptions) => {
  const extra: ThunkExtra = { ...options, outbox: options.outbox ?? createIndexedDbOutbox() }
  return configureStore({
    reducer: {
      session: sessionReducer,
      library: libraryReducer,
      notices: noticesReducer,
      outbox: outboxReducer,
      books: booksReducer,
      borrowers: borrowersReducer,
      taxonomy: taxonomyReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ thunk: { extraArgument: extra } }),
  })
}

export const store = makeStore()

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
