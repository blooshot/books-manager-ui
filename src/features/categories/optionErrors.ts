/** What to tell the user about a failed category/language change, by error name (Redux serializes errors; see STATUS gotchas). */
export function describeOptionError(error: { name?: string; message?: string; code?: string }): string {
  if (error.name === 'SessionExpiredError') return 'Your Google session has expired. Reconnect using the banner above, then try again. Nothing was changed.'
  if (error.code === 'NETWORK') return 'Could not reach Google Sheets. Category and language changes need a connection, so nothing was changed. Try again when you are back online.'
  return error.message || 'Could not save that change. Nothing was changed.'
}
