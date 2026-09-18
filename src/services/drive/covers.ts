import { resizeToJpeg, THUMB_EDGE } from '@/lib/image'
import type { DriveClient } from '@/services/drive/client'
import { getCoverFromCache, saveCoverToCache, type CoverVariant } from '@/services/drive/coverCache'
import { fetchCoverBlob } from '@/services/drive/photos'

/** Everything the loader touches outside itself, injectable so it can be tested without a browser. */
export interface CoverLoaderDeps {
  fetchBlob(fileId: string): Promise<Blob>
  readCache(fileId: string, variant: CoverVariant): Promise<Blob | null>
  writeCache(fileId: string, full: Blob, thumb?: Blob): Promise<boolean>
  makeThumb(full: Blob): Promise<Blob>
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
}

export interface CoverLoader {
  /** An object URL for `<img src>`. Reused for repeat requests; valid until `releaseAll()`. */
  getCoverUrl(fileId: string, variant: CoverVariant): Promise<string>
  /** Revokes every URL handed out (call when the app is torn down or the user signs out). */
  releaseAll(): void
}

/**
 * Serves cover images: IndexedDB first, Drive on a miss (`<img>` can't send a Bearer token, so covers are
 * fetched as blobs). A cover's bytes never change, so cache hits never need revalidating.
 * A thumbnail that isn't cached is derived from the full image (no second download when that is cached).
 */
export function createCoverLoader(deps: CoverLoaderDeps): CoverLoader {
  const urls = new Map<string, string>()
  const inFlight = new Map<string, Promise<string>>()

  /** Thumbnails are best-effort: if one can't be made, callers get the full image and nothing is cached. */
  async function deriveThumb(full: Blob): Promise<Blob | undefined> {
    try {
      return await deps.makeThumb(full)
    } catch {
      return undefined
    }
  }

  async function load(fileId: string, variant: CoverVariant): Promise<Blob> {
    const cached = await deps.readCache(fileId, variant)
    if (cached) return cached

    if (variant === 'thumb') {
      const cachedFull = await deps.readCache(fileId, 'full')
      const full = cachedFull ?? (await deps.fetchBlob(fileId))
      const thumb = await deriveThumb(full)
      await deps.writeCache(fileId, full, thumb)
      return thumb ?? full
    }

    const full = await deps.fetchBlob(fileId)
    await deps.writeCache(fileId, full)
    return full
  }

  return {
    getCoverUrl(fileId, variant) {
      const key = `${fileId}:${variant}`
      const existing = urls.get(key)
      if (existing) return Promise.resolve(existing)

      // Many list rows can ask for the same cover at once; they share one load.
      let pending = inFlight.get(key)
      if (!pending) {
        pending = load(fileId, variant)
          .then((blob) => {
            const url = deps.createObjectURL(blob)
            urls.set(key, url)
            return url
          })
          .finally(() => inFlight.delete(key))
        inFlight.set(key, pending)
      }
      return pending
    },
    releaseAll() {
      for (const url of urls.values()) deps.revokeObjectURL(url)
      urls.clear()
    },
  }
}

/** The loader wired to the real Drive client, IndexedDB cache, canvas, and object URLs. */
export function createBrowserCoverLoader(client: DriveClient): CoverLoader {
  return createCoverLoader({
    fetchBlob: (fileId) => fetchCoverBlob(client, fileId),
    readCache: getCoverFromCache,
    writeCache: saveCoverToCache,
    makeThumb: (full) => resizeToJpeg(full, THUMB_EDGE, 0.7),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  })
}
