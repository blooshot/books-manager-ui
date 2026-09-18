import { createAsyncThunk } from '@reduxjs/toolkit'
import { addOption as addOptionRow, renameOption as renameOptionRow, setOptionActive as setOptionActiveRow } from '@/services/sheets/api'
import { ValidationError } from '@/services/sheets/errors'
import { bookSet } from '@/store/booksSlice'
import { optionSaved } from '@/store/taxonomySlice'
import { booksSelectors } from '@/store/selectors'
import type { RootState } from '@/store'
import type { ThunkExtra } from '@/store/thunkExtra'
import { clientFor, inWriteQueue, withSessionCheck } from '@/store/writeSupport'
import type { ListOption, OptionList } from '@/types/library'

interface ThunkConfig {
  state: RootState
  extra: ThunkExtra
}

/**
 * Category and language changes wait for the Sheet before the screen changes (they are not optimistic) and are not
 * queued in the outbox: they are quick admin actions, and a failure simply reports why (ADR-0008). Nothing here can
 * delete: a list entry is archived (Active = No), never removed (ADR-0004).
 */
function requireReady(getState: () => RootState, list: OptionList): void {
  const message = getState().taxonomy.setup[list]
  if (message) throw new ValidationError(message)
}

export const addOption = createAsyncThunk<ListOption, { list: OptionList; name: string }, ThunkConfig>(
  'taxonomy/addOption',
  async ({ list, name }, { dispatch, getState, extra }) => {
    requireReady(getState, list)
    const option = await withSessionCheck(dispatch, () => inWriteQueue(() => addOptionRow(clientFor(getState, extra), list, name)))
    dispatch(optionSaved({ list, option }))
    return option
  },
)

/** Renames the entry, and the same text on every book that has it (the store's books follow the Sheet's). */
export const renameOption = createAsyncThunk<ListOption, { list: OptionList; from: string; to: string }, ThunkConfig>(
  'taxonomy/renameOption',
  async ({ list, from, to }, { dispatch, getState, extra }) => {
    requireReady(getState, list)
    const option = await withSessionCheck(dispatch, () => inWriteQueue(() => renameOptionRow(clientFor(getState, extra), list, from, to)))
    dispatch(optionSaved({ list, option, replaces: from }))
    const same = (a: string) => a.trim().toLowerCase() === from.trim().toLowerCase()
    for (const book of booksSelectors.selectAll(getState())) {
      if (list === 'categories' && book.categories?.some(same)) {
        const renamed = book.categories.map((name) => (same(name) ? option.name : name))
        dispatch(bookSet({ ...book, categories: [...new Set(renamed)] }))
      } else if (list === 'languages' && book.language && same(book.language)) {
        dispatch(bookSet({ ...book, language: option.name }))
      }
    }
    return option
  },
)

/** Archive (`active: false`) or restore an entry. Books keep their text either way. */
export const setOptionActive = createAsyncThunk<ListOption, { list: OptionList; name: string; active: boolean }, ThunkConfig>(
  'taxonomy/setOptionActive',
  async ({ list, name, active }, { dispatch, getState, extra }) => {
    requireReady(getState, list)
    const option = await withSessionCheck(dispatch, () => inWriteQueue(() => setOptionActiveRow(clientFor(getState, extra), list, name, active)))
    dispatch(optionSaved({ list, option }))
    return option
  },
)
