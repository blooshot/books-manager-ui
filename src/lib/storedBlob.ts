/**
 * A Blob as plain bytes plus its MIME type. IndexedDB stores these reliably in every browser (and in
 * tests), unlike Blobs, which older iOS Safari mishandles and fake-indexeddb cannot round-trip.
 */
export interface StoredBlob {
  bytes: ArrayBuffer
  type: string
}

export async function toStored(blob: Blob): Promise<StoredBlob> {
  return { bytes: await blob.arrayBuffer(), type: blob.type }
}

export function fromStored({ bytes, type }: StoredBlob): Blob {
  return new Blob([bytes], { type })
}
