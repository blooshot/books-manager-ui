import type { DriveClient } from './client'

const FOLDER_CACHE_KEY = 'drive_book_covers_folder_id'
const FOLDER_NAME = 'Book Covers'

/**
 * Finds or creates the "Book Covers" folder.
 * Caches the folder ID in localStorage.
 */
export async function getOrCreateFolderId(client: DriveClient): Promise<string> {
  // 1. Check local cache
  const cachedId = localStorage.getItem(FOLDER_CACHE_KEY)
  if (cachedId) {
    // Optionally verify it still exists? Not strictly required by spec, we assume it does.
    // If a request fails later with 404, we could clear the cache and retry, but 
    // files.list and files.create are safer for now.
    return cachedId
  }

  // 2. Search for the folder by name
  // Note: drive.file scope only sees files created by the app itself.
  const query = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const searchResult = await client.request<{ files?: { id: string }[] }>(
    `/files?q=${encodeURIComponent(query)}&spaces=drive`
  )

  if (searchResult.files && searchResult.files.length > 0 && searchResult.files[0].id) {
    const id = searchResult.files[0].id
    localStorage.setItem(FOLDER_CACHE_KEY, id)
    return id
  }

  // 3. Create the folder if it doesn't exist
  const createResult = await client.request<{ id: string }>('/files', {
    method: 'POST',
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })

  const newId = createResult.id
  localStorage.setItem(FOLDER_CACHE_KEY, newId)
  return newId
}
