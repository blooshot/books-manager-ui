import type { DriveClient } from './client'

export async function uploadCover(
  client: DriveClient,
  file: Blob,
  bookId: string,
  folderId: string
): Promise<string> {
  const metadata = {
    name: `${bookId}.jpg`,
    parents: [folderId],
  }

  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append('file', file)

  const result = await client.request<{ id: string }>('/upload/files?uploadType=multipart', {
    method: 'POST',
    body: form,
  })

  return result.id
}

export async function fetchCoverBlob(client: DriveClient, fileId: string): Promise<Blob> {
  return await client.requestBlob(`/files/${fileId}?alt=media`)
}

export async function markReplaced(client: DriveClient, fileId: string, bookId: string): Promise<void> {
  // ADR-0004: We rename instead of deleting.
  await client.request(`/files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: `deleted-file-${bookId}.jpg`,
    }),
  })
}
