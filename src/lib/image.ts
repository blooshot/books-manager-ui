/** Sizes from ADR-0007: a 1000px full image for the detail screen, ~240px thumbnails for list rows. */
export const FULL_EDGE = 1000
export const THUMB_EDGE = 240

/**
 * Scales dimensions down proportionally so the longest edge is at most `maxLongEdge`.
 * Images already small enough keep their size; non-positive input gives 0x0.
 */
export function calculateResizedDimensions(width: number, height: number, maxLongEdge = FULL_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const longestEdge = Math.max(width, height)
  if (longestEdge <= maxLongEdge) return { width, height }
  const ratio = maxLongEdge / longestEdge
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

/** The browser APIs resizing needs, injectable so the logic can be tested without a real canvas. */
export interface ImageDeps {
  decode(file: Blob): Promise<ImageBitmap>
  createCanvas(width: number, height: number): {
    getContext2d(): CanvasRenderingContext2D | null
    toBlob(callback: BlobCallback, type?: string, quality?: number): void
  }
}

export const browserImageDeps: ImageDeps = {
  // 'from-image' applies the photo's EXIF rotation, so phone photos aren't sideways.
  decode: (file) => createImageBitmap(file, { imageOrientation: 'from-image' }),
  createCanvas(width, height) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return {
      getContext2d: () => canvas.getContext('2d'),
      toBlob: (callback, type, quality) => canvas.toBlob(callback, type, quality),
    }
  },
}

/** Decodes an image, scales it to `maxLongEdge`, and re-encodes it as JPEG. */
export async function resizeToJpeg(
  file: Blob,
  maxLongEdge: number,
  quality = 0.8,
  deps: ImageDeps = browserImageDeps,
): Promise<Blob> {
  const bitmap = await deps.decode(file)
  try {
    const { width, height } = calculateResizedDimensions(bitmap.width, bitmap.height, maxLongEdge)
    if (width === 0 || height === 0) throw new Error('This image could not be read.')
    const canvas = deps.createCanvas(width, height)
    const context = canvas.getContext2d()
    if (!context) throw new Error('Image processing is not available in this browser.')
    context.drawImage(bitmap, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))), 'image/jpeg', quality)
    })
  } finally {
    bitmap.close()
  }
}

export interface CoverVariants {
  full: Blob
  thumb: Blob
}

/** The two JPEGs kept for every cover: full size for upload and detail, small for list thumbnails. */
export async function createCoverVariants(file: Blob, deps: ImageDeps = browserImageDeps): Promise<CoverVariants> {
  const full = await resizeToJpeg(file, FULL_EDGE, 0.8, deps)
  const thumb = await resizeToJpeg(file, THUMB_EDGE, 0.7, deps)
  return { full, thumb }
}
