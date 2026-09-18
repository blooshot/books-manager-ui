import type { DriveClient } from '@/services/drive/client'
import { DriveError } from '@/services/drive/errors'
import type { FolderResolver } from '@/services/drive/folder'
import { buildMultipartRelated } from '@/services/drive/multipart'

/** Uploads a cover (already resized JPEG) into the covers folder and returns the new Drive file ID. */
export async function uploadCover(client: DriveClient, file: Blob, bookId: string, folderId: string): Promise<string> {
  const { body, contentType } = buildMultipartRelated({ name: `${bookId}.jpg`, parents: [folderId] }, file, 'image/jpeg')
  const result = await client.request<{ id: string }>('/upload/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  })
  return result.id
}

/**
 * Uploads into the `Book Covers` folder, recovering once if the folder turns out to be gone
 * (deleted or trashed after it was verified this session): forget it, find or create it again, retry.
 */
export async function uploadCoverInFolder(client: DriveClient, folder: FolderResolver, file: Blob, bookId: string): Promise<string> {
  try {
    return await uploadCover(client, file, bookId, await folder.getFolderId())
  } catch (error) {
    if (!(error instanceof DriveError) || error.status !== 404) throw error
    folder.forget()
    return uploadCover(client, file, bookId, await folder.getFolderId())
  }
}

/** Downloads a cover's bytes. `<img>` can't send a Bearer token, so covers are fetched as blobs. */
export function fetchCoverBlob(client: DriveClient, fileId: string): Promise<Blob> {
  return client.requestBlob(`/files/${encodeURIComponent(fileId)}?alt=media`)
}

/**
 * ADR-0004: a replaced cover is renamed for the owner to delete by hand, never deleted or trashed.
 * The request body carries only `name`; do not add other fields (e.g. `trashed`).
 */
export async function markReplaced(client: DriveClient, fileId: string, bookId: string): Promise<void> {
  await client.request(`/files/${encodeURIComponent(fileId)}?fields=id`, {
    method: 'PATCH',
    body: JSON.stringify({ name: `deleted-file-${bookId}.jpg` }),
  })
}
