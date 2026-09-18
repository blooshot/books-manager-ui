/** Build-time configuration (see AGENTS.md > Configuration). */
export const config = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  sheetId: import.meta.env.VITE_SHEET_ID ?? '',
  currency: import.meta.env.VITE_CURRENCY ?? 'INR',
}

/** Names of required settings that are missing from the environment. */
export function missingConfig(): string[] {
  const missing: string[] = []
  if (!config.googleClientId) missing.push('VITE_GOOGLE_CLIENT_ID')
  if (!config.sheetId) missing.push('VITE_SHEET_ID')
  return missing
}

/**
 * OAuth scopes (ADR-0002, ADR-0007).
 * `userinfo.email` is non-sensitive and only used for the "Continue as ..." hint.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')
