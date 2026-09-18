const pad = (n: number) => String(n).padStart(2, '0')

/** Local date as `yyyy-mm-dd` (the format used in the Sheet). */
export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local time as `HH:mm` (the format used in the Sheet). */
export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** `yyyy-mm-dd` that is a real calendar date (rejects 2026-02-30). */
export function isRealIsoDate(text: string): boolean {
  const match = ISO_DATE.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** `HH:mm` on a 24-hour clock. */
export function isValidTime(text: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text)
}

