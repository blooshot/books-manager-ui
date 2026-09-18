import { readStored, writeStored } from '@/lib/storage'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'bm.theme'

/** Light by default; the user's manual choice is remembered. */
export function getStoredTheme(): Theme {
  return readStored(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  writeStored(THEME_KEY, theme)
}
