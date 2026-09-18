import { readStored, removeStored, writeStored } from '@/lib/storage'
import type { DriveClient } from '@/services/drive/client'
import { DriveError } from '@/services/drive/errors'

const FOLDER_NAME = 'Book Covers'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface FolderResolver {
  /** ID of the `Book Covers` folder; finds or creates it, and caches the ID per Google account. */
  getFolderId(): Promise<string>
  /** Drop the cached ID (e.g. after an upload reports the parent folder is gone), then resolve again. */
  forget(): void
}

/**
 * Create one resolver per signed-in session.
 *
 * `drive.file` only lets the app see files it created, so it must create the folder itself.
 * The ID is cached in localStorage keyed by account (an ID is not a secret), and checked once
 * per session so a folder that was deleted, trashed, or belongs to another account/client
 * is replaced instead of failing every upload.
 */
export function createFolderResolver(client: DriveClient, accountKey: string): FolderResolver {
  const cacheKey = `bm.coverFolderId:${accountKey}`
  let verified = false
  let inFlight: Promise<string> | null = null

  async function stillUsable(id: string): Promise<boolean> {
    try {
      const folder = await client.request<{ id: string; trashed?: boolean }>(
        `/files/${encodeURIComponent(id)}?fields=id,trashed`,
      )
      return folder.trashed !== true
    } catch (error) {
      if (error instanceof DriveError && error.status === 404) return false
      throw error // expired token, network, permission: not a reason to forget the folder
    }
  }

  async function resolve(): Promise<string> {
    const cached = readStored(cacheKey)
    if (cached) {
      if (verified || (await stillUsable(cached))) {
        verified = true
        return cached
      }
      removeStored(cacheKey)
    }

    // Oldest match first, so duplicates (e.g. from two devices) always resolve to the same folder.
    const query = `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`
    const found = await client.request<{ files?: { id: string }[] }>(
      `/files?q=${encodeURIComponent(query)}&spaces=drive&orderBy=createdTime&fields=files(id)`,
    )
    let id = found.files?.[0]?.id
    if (!id) {
      const created = await client.request<{ id: string }>('/files?fields=id', {
        method: 'POST',
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
      })
      id = created.id
    }
    writeStored(cacheKey, id)
    verified = true
    return id
  }

  return {
    getFolderId() {
      // Concurrent callers share one lookup, so two uploads can't create two folders.
      inFlight ??= resolve().finally(() => {
        inFlight = null
      })
      return inFlight
    },
    forget() {
      removeStored(cacheKey)
      verified = false
    },
  }
}
