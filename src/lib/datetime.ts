const pad = (n: number) => String(n).padStart(2, '0')

/** Local date as `yyyy-mm-dd` (the format used in the Sheet). */
export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local time as `HH:mm` (the format used in the Sheet). */
export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
