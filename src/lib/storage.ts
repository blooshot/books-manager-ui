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

/**
 * sessionStorage that never throws. For unsent form drafts only (fields, never tokens or photos):
 * they survive a reload of the tab but not closing it.
 */
export function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    /* storage unavailable: drafts just aren't kept */
  }
}

export function removeSession(key: string): void {
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    /* storage unavailable */
  }
}

