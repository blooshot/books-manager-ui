/**
 * Google Drive sharing links usually look like:
 * https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/view?usp=sharing
 * or
 * https://drive.google.com/open?id=1aBcDeFgHiJkLmNoPqRsTuVwXyZ
 */

const ID_REGEX = /[-\w]{25,}/

export function getDriveFileIdFromUrl(url: string): string | null {
  if (!url) return null
  
  try {
    const parsed = new URL(url)
    
    // Handle drive.google.com/open?id=XXXX
    const idParam = parsed.searchParams.get('id')
    if (idParam && ID_REGEX.test(idParam)) {
      return idParam
    }

    // Handle drive.google.com/file/d/XXXX/view
    const match = parsed.pathname.match(/\/d\/([-\w]{25,})/)
    if (match && match[1]) {
      return match[1]
    }

    // Fallback: just try to find a valid ID string anywhere in the URL
    const fallbackMatch = url.match(ID_REGEX)
    if (fallbackMatch && fallbackMatch[0]) {
      return fallbackMatch[0]
    }
  } catch {
    // If it's not a valid URL, it might just be a raw ID
    if (ID_REGEX.test(url)) {
      const match = url.match(ID_REGEX)
      return match ? match[0] : null
    }
  }

  return null
}

export function createDriveFileUrl(fileId: string): string {
  if (!fileId || !ID_REGEX.test(fileId)) {
    throw new Error('Invalid file ID provided')
  }
  return `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`
}
