/**
 * Drive links look like
 *   https://drive.google.com/file/d/<id>/view?usp=drivesdk
 *   https://drive.google.com/open?id=<id>
 * The Photo cell stores the link; the app parses the file ID back out of it.
 */
const ID_PATTERN = /^[-\w]{25,}$/
const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com'])

/** File ID from a Drive link (or a bare ID). Anything that isn't recognisably Drive returns null. */
export function getDriveFileIdFromUrl(value: string): string | null {
  const text = value.trim()
  if (text === '') return null
  if (ID_PATTERN.test(text)) return text // bare ID

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !DRIVE_HOSTS.has(url.hostname)) return null

  const fromQuery = url.searchParams.get('id')
  if (fromQuery && ID_PATTERN.test(fromQuery)) return fromQuery
  const fromPath = /\/d\/([-\w]{25,})(?:\/|$)/.exec(url.pathname)
  return fromPath ? fromPath[1] : null
}

export function createDriveFileUrl(fileId: string): string {
  if (!ID_PATTERN.test(fileId)) throw new Error('Invalid file ID provided')
  return `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`
}
