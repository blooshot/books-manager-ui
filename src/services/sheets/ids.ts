const BOOK_ID = /^B-(\d+)$/i

/** Next `B-0001` style ID: highest existing number + 1. Ignores IDs that don't match the pattern. */
export function nextBookId(existingIds: readonly string[]): string {
  let max = 0
  for (const id of existingIds) {
    const match = BOOK_ID.exec(id.trim())
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `B-${String(max + 1).padStart(4, '0')}`
}
