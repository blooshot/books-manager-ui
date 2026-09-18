import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { signOut } from '@/store/sessionSlice'
import type { ListOption, OptionList } from '@/types/library'

export interface TaxonomyState {
  categories: ListOption[]
  languages: ListOption[]
  /** For a list that cannot be used yet: what to add to the Sheet. Absent means the list works. */
  setup: Partial<Record<OptionList, string>>
}

const initialState: TaxonomyState = { categories: [], languages: [], setup: {} }

/** The managed lists (categories, languages). Archived entries stay here so they can be restored. */
const taxonomySlice = createSlice({
  name: 'taxonomy',
  initialState,
  reducers: {
    taxonomyLoaded: (_state, action: PayloadAction<TaxonomyState>) => action.payload,
    /** Insert an option, or replace the one it renames (`replaces`) or that has the same name (ignoring case). */
    optionSaved(state, action: PayloadAction<{ list: OptionList; option: ListOption; replaces?: string }>) {
      const { list, option, replaces } = action.payload
      const key = (replaces ?? option.name).toLowerCase()
      const at = state[list].findIndex((o) => o.name.toLowerCase() === key)
      if (at === -1) state[list].push(option)
      else state[list][at] = option
    },
  },
  extraReducers: (builder) => {
    builder.addCase(signOut.fulfilled, () => initialState)
  },
})

export const { taxonomyLoaded, optionSaved } = taxonomySlice.actions
export default taxonomySlice.reducer
