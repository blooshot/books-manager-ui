/**
 * localStorage that never throws (private windows, blocked site data).
 * Only for per-viewer conveniences (theme, email hint) — never for tokens (ADR-0002).
 */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: the app works without it */
  }
}

export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}
