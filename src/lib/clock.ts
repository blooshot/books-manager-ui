/**
 * "Now" for the UI edge (default date/time in forms). Logic that is unit-tested takes a `now`
 * argument instead; this exists so component tests can pin the time.
 */
let override: Date | null = null

export const clock = {
  now: (): Date => override ?? new Date(),
}

/** Tests only: pin (or with `null`, release) the current time. */
export function setClockForTests(date: Date | null): void {
  override = date
}
